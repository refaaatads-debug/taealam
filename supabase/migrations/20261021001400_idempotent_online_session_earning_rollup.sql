-- Session values in public.sessions are the canonical per-session earnings.
-- The teacher_earnings row is only an unconfirmed monthly rollup used by the
-- existing admin workflow; it must not be inserted as a second earning.
--
-- Serialize creation/updates of that rollup per teacher/month. A private
-- per-session claim table is the uniqueness boundary; notes remain audit text
-- only and are never used as the idempotency guarantee. No uniqueness is
-- added to teacher/month because manual transfers can have multiple rows.
CREATE TABLE IF NOT EXISTS public.teacher_session_earning_claims (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL,
  earning_month text NOT NULL CHECK (earning_month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount numeric NOT NULL CHECK (amount >= 0),
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_session_earning_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_session_earning_claims
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_create_teacher_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid;
  v_delivery_mode text;
  v_month text;
  v_marker text;
  v_claimed integer;
  v_claim_teacher uuid;
  v_claim_month text;
  v_rollup public.teacher_earnings%ROWTYPE;
BEGIN
  IF NEW.ended_at IS NULL
     OR OLD.ended_at IS NOT NULL
     OR NEW.short_session IS DISTINCT FROM false
     OR COALESCE(NEW.teacher_earning, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT b.teacher_id, b.delivery_mode
  INTO v_teacher_id, v_delivery_mode
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;
  IF NOT FOUND OR v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Session earning has no assigned teacher'
      USING ERRCODE = 'P0001';
  END IF;

  -- In-person earnings are settled by their dedicated ledger and completion
  -- worker, never by the generic online-session rollup.
  IF v_delivery_mode IS DISTINCT FROM 'online' THEN
    RETURN NEW;
  END IF;

  v_month := to_char(NEW.ended_at AT TIME ZONE 'UTC', 'YYYY-MM');
  v_marker := 'auto:session:' || NEW.id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'auto-session-earning:' || v_teacher_id::text || ':' || v_month, 0
  ));

  INSERT INTO public.teacher_session_earning_claims (
    session_id, teacher_id, earning_month, amount
  )
  VALUES (NEW.id, v_teacher_id, v_month, NEW.teacher_earning)
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    SELECT teacher_id, earning_month
    INTO v_claim_teacher, v_claim_month
    FROM public.teacher_session_earning_claims
    WHERE session_id = NEW.id;
    IF NOT FOUND OR v_claim_teacher IS DISTINCT FROM v_teacher_id
       OR v_claim_month IS DISTINCT FROM v_month THEN
      RAISE EXCEPTION 'Session earning claim conflicts with its saved teacher or month'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_rollup
  FROM public.teacher_earnings e
  WHERE e.teacher_id = v_teacher_id
    AND e.month = v_month
    AND e.earning_type = 'monthly_transfer'
    AND e.status = 'unconfirmed'
    AND e.notes LIKE 'auto:session:%'
  ORDER BY e.created_at, e.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF strpos(COALESCE(v_rollup.notes, ''), v_marker) > 0 THEN
      RETURN NEW;
    END IF;

    UPDATE public.teacher_earnings
    SET amount = amount + NEW.teacher_earning,
        gross_amount = COALESCE(gross_amount, 0) + COALESCE(NEW.gross_amount, 0),
        platform_fee = COALESCE(platform_fee, 0) + COALESCE(NEW.platform_fee, 0),
        teacher_base_amount = COALESCE(teacher_base_amount, 0)
          + COALESCE(NEW.teacher_base_amount, 0),
        net_amount = COALESCE(net_amount, 0)
          + COALESCE(NEW.net_amount, NEW.teacher_earning),
        vat_amount = COALESCE(vat_amount, 0) + COALESCE(NEW.vat_amount, 0),
        hours = COALESCE(hours, 0)
          + ROUND(COALESCE(NEW.duration_minutes, 0)::numeric / 60.0, 4),
        minutes_snapshot = COALESCE(minutes_snapshot, 0)
          + COALESCE(NEW.duration_minutes, 0),
        total_sessions_snapshot = COALESCE(total_sessions_snapshot, 0) + 1,
        notes = concat_ws(', ', NULLIF(notes, ''), v_marker)
    WHERE id = v_rollup.id;
  ELSE
    INSERT INTO public.teacher_earnings (
      teacher_id, amount, gross_amount, platform_fee,
      teacher_base_amount, net_amount, vat_amount,
      vat_rate_snapshot, platform_fee_rate_snapshot,
      hours, minutes_snapshot, total_sessions_snapshot,
      month, status, earning_type, notes
    )
    VALUES (
      v_teacher_id, NEW.teacher_earning,
      COALESCE(NEW.gross_amount, 0), COALESCE(NEW.platform_fee, 0),
      COALESCE(NEW.teacher_base_amount, 0),
      COALESCE(NEW.net_amount, NEW.teacher_earning),
      COALESCE(NEW.vat_amount, 0), COALESCE(NEW.vat_rate_snapshot, 0),
      COALESCE(NEW.platform_fee_rate_snapshot, 0),
      ROUND(COALESCE(NEW.duration_minutes, 0)::numeric / 60.0, 4),
      COALESCE(NEW.duration_minutes, 0), 1,
      v_month, 'unconfirmed', 'monthly_transfer', v_marker
    );
  END IF;

  RETURN NEW;
END;
$$;
