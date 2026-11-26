-- Teacher promotion ("إعلان"): admin-chosen teachers shown first in student search.
-- Additive only (new table). Two separate lists: online and in_person, max 10 active each.
-- Rollback: see 20261126150000_teacher_promotions_ROLLBACK.sql (DROP TABLE public.teacher_promotions CASCADE).
CREATE TABLE IF NOT EXISTS public.teacher_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('online', 'in_person')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, mode),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_teacher_promotions_mode_active
  ON public.teacher_promotions (mode, is_active, display_order);

ALTER TABLE public.teacher_promotions ENABLE ROW LEVEL SECURITY;

-- Students/visitors can only see promotions that are active right now; admins see all.
CREATE POLICY "Read live promotions" ON public.teacher_promotions
  FOR SELECT TO anon, authenticated
  USING (
    (is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins manage promotions" ON public.teacher_promotions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Max 10 active promotions per mode.
CREATE OR REPLACE FUNCTION public.enforce_teacher_promotion_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.is_active AND (
    SELECT count(*) FROM public.teacher_promotions p
    WHERE p.mode = NEW.mode AND p.is_active AND p.id <> NEW.id
  ) >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 active promoted teachers per list' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_teacher_promotion_limit
  BEFORE INSERT OR UPDATE ON public.teacher_promotions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_promotion_limit();

-- Only teachers can be promoted.
CREATE OR REPLACE FUNCTION public.enforce_promotion_is_teacher()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teacher_profiles t WHERE t.user_id = NEW.teacher_id AND t.is_approved) THEN
    RAISE EXCEPTION 'Only approved teachers can be promoted' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_teacher_promotion_is_teacher
  BEFORE INSERT ON public.teacher_promotions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_promotion_is_teacher();

-- Table grants (RLS above decides who can actually read/write).
GRANT SELECT ON public.teacher_promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_promotions TO authenticated;
