ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'free';
ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_tier_key;