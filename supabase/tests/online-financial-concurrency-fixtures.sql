-- Committed only in the isolated schema test database so separate sessions
-- can race the session-ending trigger. Run cleanup after assertions.
BEGIN;
INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'concurrent-teacher@example.invalid', '', now(), now()),
  ('a3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'concurrent-student-one@example.invalid', '', now(), now()),
  ('a3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'concurrent-student-two@example.invalid', '', now(), now());

INSERT INTO public.profiles(user_id, full_name)
VALUES
  ('a3000000-0000-4000-8000-000000000001', 'Synthetic concurrent teacher'),
  ('a3000000-0000-4000-8000-000000000002', 'Synthetic concurrent student one'),
  ('a3000000-0000-4000-8000-000000000003', 'Synthetic concurrent student two')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
VALUES ('a3000000-0000-4000-8000-000000000001', 20, true, 'approved');
INSERT INTO public.subscription_plans(id, tier, name_ar, price, sessions_count, session_duration_minutes)
VALUES ('a3000000-0000-4000-8000-000000000004', 'basic', 'خطة اختبار تزامن', 1, 1, 60);
INSERT INTO public.user_subscriptions(
  id, user_id, plan_id, starts_at, ends_at, is_active, remaining_minutes, total_hours, session_duration_minutes
)
VALUES
  ('a3000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000004', now()-interval '1 day', now()+interval '10 days', true, 100, 2, 60),
  ('a3000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000004', now()-interval '1 day', now()+interval '10 days', true, 100, 2, 60);

INSERT INTO public.bookings(id, student_id, teacher_id, scheduled_at, duration_minutes, status, used_subscription, subscription_id)
VALUES
  ('a3000000-0000-4000-8000-000000000007', 'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', now()+interval '2 days', 60, 'confirmed', true, 'a3000000-0000-4000-8000-000000000005'),
  ('a3000000-0000-4000-8000-000000000008', 'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000001', now()+interval '3 days', 60, 'confirmed', true, 'a3000000-0000-4000-8000-000000000006');

INSERT INTO public.sessions(id, booking_id)
SELECT seed.session_id, seed.booking_id
FROM (VALUES
  ('a3000000-0000-4000-8000-000000000009'::uuid, 'a3000000-0000-4000-8000-000000000007'::uuid),
  ('a3000000-0000-4000-8000-000000000010'::uuid, 'a3000000-0000-4000-8000-000000000008'::uuid)
) AS seed(session_id, booking_id)
WHERE NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.booking_id = seed.booking_id);
COMMIT;
