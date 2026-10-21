-- Run only in a new isolated production-schema clone. Keep committed briefly
-- so two separate worker sessions can race the same due booking.
BEGIN;
DELETE FROM public.user_roles
WHERE user_id IN (
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002'
);
INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('a5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'concurrent-inperson-teacher@example.invalid', '', now(), now()),
  ('a5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'concurrent-inperson-student@example.invalid', '', now(), now());
INSERT INTO public.teacher_profiles(user_id, hourly_rate, is_approved, approval_status)
VALUES ('a5000000-0000-4000-8000-000000000001', 20, true, 'approved');
INSERT INTO public.bookings(
  id, student_id, teacher_id, scheduled_at, duration_minutes, status
)
VALUES (
  'a5000000-0000-4000-8000-000000000003',
  'a5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000001',
  now() - interval '46 minutes', 45, 'confirmed'
);
UPDATE public.bookings
SET delivery_mode = 'in_person',
    instruction_duration_minutes = 45,
    attendance_confirmed_at = now() - interval '46 minutes',
    session_status = 'in_progress'
WHERE id = 'a5000000-0000-4000-8000-000000000003';
INSERT INTO public.in_person_teacher_earnings(
  booking_id, teacher_id, amount, status, available_at
)
VALUES (
  'a5000000-0000-4000-8000-000000000003',
  'a5000000-0000-4000-8000-000000000001',
  60, 'pending', now() - interval '1 minute'
);
COMMIT;
