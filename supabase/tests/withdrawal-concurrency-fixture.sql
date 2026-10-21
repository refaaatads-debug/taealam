-- Commit only in the isolated production-schema clone so two connections can race.
BEGIN;
DELETE FROM public.user_roles WHERE user_id = 'a9010000-0000-4000-8000-000000000001';
INSERT INTO auth.users(id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES ('a9010000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'withdrawal-race@example.invalid', '', now(), now());
INSERT INTO public.profiles(user_id, full_name)
VALUES ('a9010000-0000-4000-8000-000000000001', 'Synthetic withdrawal race')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.teacher_earnings(teacher_id, amount, month, status, earning_type, notes)
VALUES (
  'a9010000-0000-4000-8000-000000000001',
  120,
  to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM'),
  'confirmed',
  'bonus',
  'synthetic concurrent withdrawal test'
);
COMMIT;
