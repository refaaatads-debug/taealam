-- Rollback for 20261126150000_teacher_promotions.sql (the site keeps working: clients ignore a missing table).
DROP TABLE IF EXISTS public.teacher_promotions CASCADE;
DROP FUNCTION IF EXISTS public.enforce_teacher_promotion_limit();
DROP FUNCTION IF EXISTS public.enforce_promotion_is_teacher();
