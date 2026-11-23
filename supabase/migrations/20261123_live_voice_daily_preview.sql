-- PREVIEW ONLY. Not applied. Requires separate owner GO and provider/client gate.
BEGIN;
CREATE TABLE public.live_voice_days (
 user_id uuid NOT NULL REFERENCES auth.users(id), usage_day date NOT NULL,
 reserved_seconds integer NOT NULL DEFAULT 0 CHECK(reserved_seconds >= 0),
 PRIMARY KEY(user_id,usage_day)
);
CREATE TABLE public.live_voice_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 usage_day date NOT NULL, held_seconds integer NOT NULL CHECK(held_seconds=300),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 blocked_until timestamptz NOT NULL, conversation_id text UNIQUE,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','issued','settled')),
 actual_seconds integer CHECK(actual_seconds>=0), settled_at timestamptz,
 FOREIGN KEY(user_id,usage_day) REFERENCES public.live_voice_days(user_id,usage_day)
);
ALTER TABLE public.live_voice_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_voice_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_voice_days, public.live_voice_reservations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserve_live_voice(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t timestamptz:=clock_timestamp(); d date; n integer; rid uuid;
BEGIN
 d:=(t AT TIME ZONE 'Asia/Riyadh')::date;
 -- Do not issue a 15-minute-start ticket + 5-minute-call across local midnight.
 IF t + interval '20 minutes 10 seconds' >= ((d+1)::timestamp AT TIME ZONE 'Asia/Riyadh') THEN
   RETURN jsonb_build_object('allowed',false,'reason','day_boundary'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user AND account_status='active' AND is_deleted=false)
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR NOT EXISTS(SELECT 1 FROM public.user_subscriptions s JOIN public.subscription_plans sp ON sp.id=s.plan_id
 WHERE s.user_id=p_user AND s.is_active=true AND s.remaining_minutes>0 AND sp.tier='premium') THEN
 RETURN jsonb_build_object('allowed',false,'reason','account_ineligible'); END IF;
 INSERT INTO public.live_voice_days(user_id,usage_day) VALUES(p_user,d) ON CONFLICT DO NOTHING;
 SELECT reserved_seconds INTO n FROM public.live_voice_days WHERE user_id=p_user AND usage_day=d FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.live_voice_reservations WHERE user_id=p_user AND state<>'settled' AND blocked_until>t) THEN
 RETURN jsonb_build_object('allowed',false,'reason','conversation_reserved'); END IF;
 IF n+300>900 THEN RETURN jsonb_build_object('allowed',false,'reason','daily_limit'); END IF;
 UPDATE public.live_voice_days SET reserved_seconds=reserved_seconds+300 WHERE user_id=p_user AND usage_day=d;
 INSERT INTO public.live_voice_reservations(user_id,usage_day,held_seconds,blocked_until)
 VALUES(p_user,d,300,t+interval '20 minutes 10 seconds') RETURNING id INTO rid;
 RETURN jsonb_build_object('allowed',true,'reservation_id',rid,'max_seconds',300);
END $$;

CREATE FUNCTION public.bind_live_voice(p_reservation uuid,p_conversation text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_conversation IS NULL OR p_conversation NOT LIKE 'conv_%' OR length(p_conversation)>200 THEN RETURN false; END IF;
 UPDATE public.live_voice_reservations SET conversation_id=p_conversation,state='issued'
 WHERE id=p_reservation AND state='reserved' AND blocked_until>clock_timestamp()
 AND created_at + interval '10 seconds' >= clock_timestamp();
 RETURN FOUND;
END $$;

-- Only a verified provider terminal event reaches this function, never client data.
CREATE FUNCTION public.settle_live_voice(p_conversation text,p_actual integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.live_voice_reservations; refund integer;
BEGIN
 IF p_actual IS NULL OR p_actual<0 THEN RAISE EXCEPTION 'invalid duration'; END IF;
 -- All operations lock day before reservation to avoid deadlocks with issuance.
 SELECT * INTO r FROM public.live_voice_reservations WHERE conversation_id=p_conversation;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_conversation'); END IF;
 PERFORM 1 FROM public.live_voice_days WHERE user_id=r.user_id AND usage_day=r.usage_day FOR UPDATE;
 SELECT * INTO r FROM public.live_voice_reservations WHERE conversation_id=p_conversation FOR UPDATE;
 IF r.state='settled' THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 refund:=r.held_seconds-p_actual;
 UPDATE public.live_voice_days SET reserved_seconds=GREATEST(0,reserved_seconds-refund)
 WHERE user_id=r.user_id AND usage_day=r.usage_day;
 UPDATE public.live_voice_reservations SET state='settled',actual_seconds=p_actual,settled_at=clock_timestamp()
 WHERE id=r.id;
 RETURN jsonb_build_object('ok',true,'provider_overrun',p_actual>r.held_seconds);
END $$;
REVOKE ALL ON FUNCTION public.reserve_live_voice(uuid),public.bind_live_voice(uuid,text),public.settle_live_voice(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_live_voice(uuid),public.bind_live_voice(uuid,text),public.settle_live_voice(text,integer) TO service_role;
COMMIT;
