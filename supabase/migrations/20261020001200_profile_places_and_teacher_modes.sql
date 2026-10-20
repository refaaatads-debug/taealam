-- Saudi-only location catalogue backed by Google Places results, not hand-entered
-- UI lists. Existing addresses, bookings, and balances are left untouched.
CREATE TABLE IF NOT EXISTS public.countries (
  iso2 text PRIMARY KEY CHECK (iso2 = upper(iso2) AND length(iso2) = 2),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

INSERT INTO public.countries (iso2, name_ar, name_en)
VALUES ('SA', 'المملكة العربية السعودية', 'Saudi Arabia')
ON CONFLICT (iso2) DO UPDATE
SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, is_active = true;

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS country_iso2 text NOT NULL DEFAULT 'SA'
    REFERENCES public.countries(iso2),
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS places_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT SELECT ON public.cities TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cities FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS cities_country_normalized_name_uidx
  ON public.cities (
    country_iso2,
    lower(regexp_replace(btrim(name_ar), '[[:space:]]+', ' ', 'g'))
  );

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS teaching_mode text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS in_person_rejection_reason text;

ALTER TABLE public.teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_teaching_mode_check;
ALTER TABLE public.teacher_profiles
  ADD CONSTRAINT teacher_profiles_teaching_mode_check
    CHECK (teaching_mode IN ('online', 'in_person', 'both'));

CREATE TABLE IF NOT EXISTS public.teacher_service_locations (
  teacher_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  country_iso2 text NOT NULL REFERENCES public.countries(iso2),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  street_address text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  service_radius_km integer NOT NULL CHECK (service_radius_km BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_service_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_service_locations FROM anon, authenticated;
GRANT SELECT ON public.teacher_service_locations TO authenticated;
DROP POLICY IF EXISTS teacher_service_location_owner_read ON public.teacher_service_locations;
CREATE POLICY teacher_service_location_owner_read ON public.teacher_service_locations
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.upsert_saudi_city_from_places(
  p_name_ar text,
  p_name_en text,
  p_latitude double precision,
  p_longitude double precision,
  p_country_iso2 text DEFAULT 'SA'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_name text := regexp_replace(btrim(COALESCE(p_name_ar, '')), '[[:space:]]+', ' ', 'g');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'student'::public.app_role)
             OR public.has_role(auth.uid(), 'teacher'::public.app_role))
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'Location catalogue access is limited to enabled pilot users'
      USING ERRCODE = '42501';
  END IF;
  IF p_country_iso2 <> 'SA' OR v_name = '' OR length(v_name) > 120
     OR p_latitude NOT BETWEEN 16.0 AND 33.0
     OR p_longitude NOT BETWEEN 33.0 AND 57.0 THEN
    RAISE EXCEPTION 'Choose a valid Saudi location from Google Maps'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cities:SA:' || lower(v_name)));
  SELECT id INTO v_id FROM public.cities
  WHERE country_iso2 = 'SA'
    AND lower(regexp_replace(btrim(name_ar), '[[:space:]]+', ' ', 'g')) = lower(v_name)
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.cities(name_ar, name_en, country_iso2, places_source)
    VALUES (v_name, NULLIF(btrim(p_name_en), ''), 'SA', 'google_places')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cities
    SET name_en = COALESCE(NULLIF(btrim(p_name_en), ''), name_en),
        places_source = 'google_places'
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_saudi_city_from_places(text, text, double precision, double precision, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_saudi_city_from_places(text, text, double precision, double precision, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_teacher_service_location(
  p_city_id uuid,
  p_street_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_service_radius_km integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_teacher_id uuid := auth.uid();
BEGIN
  IF v_teacher_id IS NULL
     OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'In-person pilot is not enabled for this teacher'
      USING ERRCODE = '42501';
  END IF;
  IF p_street_address IS NULL OR btrim(p_street_address) = ''
     OR length(p_street_address) > 500
     OR p_latitude NOT BETWEEN 16.0 AND 33.0
     OR p_longitude NOT BETWEEN 33.0 AND 57.0
     OR p_service_radius_km NOT BETWEEN 1 AND 100
     OR NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id AND country_iso2 = 'SA' AND is_active) THEN
    RAISE EXCEPTION 'Enter a valid Saudi service address, location, and radius'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.teacher_service_locations
    (teacher_id, country_iso2, city_id, street_address, latitude, longitude, service_radius_km)
  VALUES
    (v_teacher_id, 'SA', p_city_id, btrim(p_street_address), p_latitude, p_longitude, p_service_radius_km)
  ON CONFLICT (teacher_id) DO UPDATE SET
    country_iso2 = EXCLUDED.country_iso2, city_id = EXCLUDED.city_id,
    street_address = EXCLUDED.street_address, latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude, service_radius_km = EXCLUDED.service_radius_km,
    updated_at = now();

  UPDATE public.teacher_profiles
  SET city_id = p_city_id, in_person_latitude = p_latitude, in_person_longitude = p_longitude,
      in_person_service_radius_km = p_service_radius_km, in_person_enabled = false,
      in_person_approval_status = 'pending',
      updated_at = now()
  WHERE user_id = v_teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher profile not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_teacher_service_location(uuid, text, double precision, double precision, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_teacher_service_location(uuid, text, double precision, double precision, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_teacher_in_person_settings()
RETURNS TABLE (
  teaching_mode text, approval_status text, rejection_reason text,
  city_id uuid, city_name text, street_address text,
  latitude double precision, longitude double precision,
  service_radius_km integer, available_from time, available_to time,
  available_days text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tp.teaching_mode, tp.in_person_approval_status, tp.in_person_rejection_reason,
         loc.city_id, c.name_ar, loc.street_address, loc.latitude, loc.longitude,
         loc.service_radius_km, tp.available_from, tp.available_to, tp.available_days
  FROM public.teacher_profiles tp
  LEFT JOIN public.teacher_service_locations loc ON loc.teacher_id = tp.user_id
  LEFT JOIN public.cities c ON c.id = loc.city_id
  WHERE tp.user_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::public.app_role)
    AND public.is_in_person_test_user();
$$;
REVOKE ALL ON FUNCTION public.get_my_teacher_in_person_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_in_person_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_teacher_teaching_mode(p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'teacher'::public.app_role)
     OR NOT public.is_in_person_test_user() THEN
    RAISE EXCEPTION 'Teacher mode settings are limited to enabled pilot teachers'
      USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('online', 'in_person', 'both') THEN
    RAISE EXCEPTION 'Invalid teaching mode' USING ERRCODE = '22023';
  END IF;
  UPDATE public.teacher_profiles
  SET teaching_mode = p_mode,
      in_person_enabled = CASE WHEN p_mode = 'online' THEN false ELSE in_person_enabled END,
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_teacher_teaching_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_teacher_teaching_mode(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_in_person_teacher_review(
  p_teacher_id uuid,
  p_approval_status text,
  p_enabled boolean,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_approval_status NOT IN ('not_requested', 'pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid in-person approval status' USING ERRCODE = '22023';
  END IF;
  IF p_approval_status = 'rejected' AND NULLIF(btrim(COALESCE(p_rejection_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND p_approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved teachers can be enabled' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM public.teacher_profiles
    WHERE user_id = p_teacher_id AND is_approved AND city_id IS NOT NULL
      AND in_person_latitude IS NOT NULL AND in_person_longitude IS NOT NULL
      AND in_person_service_radius_km BETWEEN 1 AND 100
      AND teaching_mode IN ('in_person', 'both')
  ) THEN
    RAISE EXCEPTION 'Teacher profile must be approved with a complete service location'
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.teacher_profiles
  SET in_person_approval_status = p_approval_status,
      in_person_enabled = p_enabled,
      in_person_rejection_reason = CASE WHEN p_approval_status = 'rejected'
        THEN btrim(p_rejection_reason) ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Teacher profile not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_in_person_teacher_review(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_in_person_teacher_review(uuid, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_in_person_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.teaching_mode = 'online' THEN
    NEW.in_person_enabled := false;
  END IF;
  IF auth.uid() = OLD.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.in_person_approval_status IS DISTINCT FROM OLD.in_person_approval_status
       AND NEW.in_person_approval_status <> 'pending' THEN
      RAISE EXCEPTION 'Teachers may request review but cannot approve or reject themselves'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.in_person_rejection_reason IS DISTINCT FROM OLD.in_person_rejection_reason THEN
      RAISE EXCEPTION 'Only administrators can change the rejection reason'
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
