-- Add session_duration_minutes to user_subscriptions
-- Stores the session duration AT SUBSCRIPTION TIME so plan changes do not affect existing subscribers

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS session_duration_minutes integer NOT NULL DEFAULT 60;

-- Populate existing subscriptions from their plan
UPDATE user_subscriptions us
SET session_duration_minutes = COALESCE(sp.session_duration_minutes, 60)
FROM subscription_plans sp
WHERE us.plan_id = sp.id;

-- Trigger: auto-copy from plan on new subscription
CREATE OR REPLACE FUNCTION set_subscription_session_duration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(session_duration_minutes, 60)
  INTO NEW.session_duration_minutes
  FROM subscription_plans WHERE id = NEW.plan_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_subscription_session_duration ON user_subscriptions;
CREATE TRIGGER trg_set_subscription_session_duration
  BEFORE INSERT ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_subscription_session_duration();
