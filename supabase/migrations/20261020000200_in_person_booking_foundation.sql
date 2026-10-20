-- Additive foundation for in-person lessons.
-- Existing bookings remain online and existing subscription balances are not changed.

CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS in_person_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_person_approval_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS in_person_service_radius_km integer,
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id);

ALTER TABLE public.teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_in_person_approval_status_check;
ALTER TABLE public.teacher_profiles
  ADD CONSTRAINT teacher_profiles_in_person_approval_status_check
    CHECK (in_person_approval_status IN ('not_requested', 'pending', 'approved', 'rejected'));
ALTER TABLE public.teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_in_person_service_radius_check;
ALTER TABLE public.teacher_profiles
  ADD CONSTRAINT teacher_profiles_in_person_service_radius_check
    CHECK (in_person_service_radius_km IS NULL OR in_person_service_radius_km BETWEEN 1 AND 100);

CREATE OR REPLACE FUNCTION public.protect_in_person_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() = OLD.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.in_person_approval_status IS DISTINCT FROM OLD.in_person_approval_status THEN
      RAISE EXCEPTION 'Only an administrator can change in-person approval status'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.in_person_enabled AND OLD.in_person_approval_status <> 'approved' THEN
      RAISE EXCEPTION 'In-person teaching must be approved before it can be enabled'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_in_person_teacher_approval_trigger ON public.teacher_profiles;
CREATE TRIGGER protect_in_person_teacher_approval_trigger
  BEFORE UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_in_person_teacher_approval();

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id),
  street_address text NOT NULL,
  district text,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  additional_details text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_primary_per_owner
  ON public.user_addresses(owner_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS user_addresses_owner_city_idx
  ON public.user_addresses(owner_id, city_id);
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_addresses_owner_manage ON public.user_addresses;
CREATE POLICY user_addresses_owner_manage ON public.user_addresses
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS cities_active_read ON public.cities;
CREATE POLICY cities_active_read ON public.cities
  FOR SELECT TO anon, authenticated
  USING (is_active);
DROP POLICY IF EXISTS cities_admin_manage ON public.cities;
CREATE POLICY cities_admin_manage ON public.cities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Additive mode fields. Historical rows are explicitly kept as online.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS instruction_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS balance_cost_minutes integer,
  ADD COLUMN IF NOT EXISTS visit_address_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_person_policy_version integer;

UPDATE public.bookings
SET delivery_mode = 'online',
    instruction_duration_minutes = COALESCE(instruction_duration_minutes, duration_minutes)
WHERE delivery_mode IS NULL
   OR instruction_duration_minutes IS NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_delivery_mode_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_delivery_mode_check CHECK (delivery_mode IN ('online', 'in_person'));
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_duration_values_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_duration_values_check
    CHECK (
      instruction_duration_minutes IS NULL OR instruction_duration_minutes > 0
    );
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_balance_cost_values_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_balance_cost_values_check
    CHECK (balance_cost_minutes IS NULL OR balance_cost_minutes > 0);
CREATE INDEX IF NOT EXISTS bookings_delivery_mode_status_time_idx
  ON public.bookings(delivery_mode, status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.in_person_request_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id),
  subject_id uuid REFERENCES public.subjects(id),
  scheduled_at timestamptz NOT NULL,
  city_id uuid NOT NULL REFERENCES public.cities(id),
  address_id uuid NOT NULL REFERENCES public.user_addresses(id),
  visit_address_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'cancelled', 'expired')),
  acceptance_deadline timestamptz NOT NULL,
  policy_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (acceptance_deadline < scheduled_at)
);
CREATE INDEX IF NOT EXISTS in_person_request_groups_open_deadline_idx
  ON public.in_person_request_groups(acceptance_deadline) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS in_person_request_groups_student_time_idx
  ON public.in_person_request_groups(student_id, scheduled_at);
ALTER TABLE public.in_person_request_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.in_person_request_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_group_id uuid NOT NULL REFERENCES public.in_person_request_groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'closed')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_group_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS in_person_recipients_teacher_status_idx
  ON public.in_person_request_recipients(teacher_id, status);
ALTER TABLE public.in_person_request_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.in_person_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_group_id uuid NOT NULL UNIQUE REFERENCES public.in_person_request_groups(id),
  booking_id uuid UNIQUE REFERENCES public.bookings(id),
  student_id uuid NOT NULL REFERENCES auth.users(id),
  subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id),
  reserved_minutes integer NOT NULL DEFAULT 100 CHECK (reserved_minutes = 100),
  consumed_minutes integer NOT NULL DEFAULT 0 CHECK (consumed_minutes BETWEEN 0 AND 100),
  released_minutes integer NOT NULL DEFAULT 0 CHECK (released_minutes BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'partially_settled', 'released')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CHECK (consumed_minutes + released_minutes <= reserved_minutes)
);
CREATE INDEX IF NOT EXISTS in_person_reservations_subscription_status_idx
  ON public.in_person_credit_reservations(subscription_id, status);
ALTER TABLE public.in_person_credit_reservations ENABLE ROW LEVEL SECURITY;

-- The four-digit value must be retrievable by the assigned teacher before class,
-- so keep it in a separate table with no direct client privileges. Access is
-- intended to be added only through narrowly scoped SECURITY DEFINER RPCs.
CREATE TABLE IF NOT EXISTS public.in_person_attendance_codes (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  code_value char(4) NOT NULL CHECK (code_value ~ '^[0-9]{4}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  revealed_at timestamptz,
  confirmed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.in_person_attendance_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_person_attendance_codes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.in_person_teacher_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric(10,2) NOT NULL CHECK (amount = 30),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'paid', 'adjusted')),
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);
ALTER TABLE public.in_person_teacher_compensations ENABLE ROW LEVEL SECURITY;

-- No address, recipient, reservation, or code rows are directly readable from
-- the client. Their authorized flows will be exposed through scoped RPCs.
REVOKE ALL ON public.in_person_request_groups,
  public.in_person_request_recipients,
  public.in_person_credit_reservations,
  public.in_person_teacher_compensations
  FROM anon, authenticated;

COMMENT ON COLUMN public.bookings.instruction_duration_minutes IS
  'Actual lesson teaching duration. For in-person lessons this is 60; distinct from package credit cost.';
COMMENT ON COLUMN public.bookings.balance_cost_minutes IS
  'Package-credit minutes charged to the student. For in-person lessons this is 100; distinct from teaching duration.';

-- Test access is an explicit, role-scoped allowlist. It remains empty until
-- named test accounts are added after their identities are verified.
CREATE TABLE IF NOT EXISTS public.in_person_feature_testers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.in_person_feature_testers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_person_feature_testers FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_in_person_test_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.in_person_feature_testers AS tester
    JOIN public.user_roles AS role_row
      ON role_row.user_id = tester.user_id
     AND role_row.role = tester.role
    WHERE tester.user_id = auth.uid()
      AND tester.enabled
  );
$$;
REVOKE ALL ON FUNCTION public.is_in_person_test_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_in_person_test_user() TO authenticated;
COMMENT ON FUNCTION public.is_in_person_test_user() IS
  'Fail-closed role-scoped allowlist check for the in-person pilot. The allowlist is populated only after test identities are verified.';
