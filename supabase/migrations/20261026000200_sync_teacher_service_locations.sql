BEGIN;

-- teacher_service_locations is the location currently shown in teacher settings.
-- Reconcile legacy search columns before installing the synchronization trigger.
UPDATE public.teacher_profiles AS tp
SET city_id = location.city_id,
    in_person_latitude = location.latitude,
    in_person_longitude = location.longitude,
    in_person_service_radius_km = location.service_radius_km,
    in_person_enabled = false,
    in_person_approval_status = 'pending',
    in_person_rejection_reason = NULL,
    updated_at = now()
FROM public.teacher_service_locations AS location
WHERE location.teacher_id = tp.user_id
  AND (
    tp.city_id IS DISTINCT FROM location.city_id
    OR tp.in_person_latitude IS DISTINCT FROM location.latitude
    OR tp.in_person_longitude IS DISTINCT FROM location.longitude
    OR tp.in_person_service_radius_km IS DISTINCT FROM location.service_radius_km
  );

CREATE OR REPLACE FUNCTION public.sync_teacher_service_location_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_location_changed boolean := TG_OP = 'INSERT';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_location_changed :=
      OLD.country_iso2 IS DISTINCT FROM NEW.country_iso2
      OR OLD.city_id IS DISTINCT FROM NEW.city_id
      OR OLD.street_address IS DISTINCT FROM NEW.street_address
      OR OLD.latitude IS DISTINCT FROM NEW.latitude
      OR OLD.longitude IS DISTINCT FROM NEW.longitude
      OR OLD.service_radius_km IS DISTINCT FROM NEW.service_radius_km;
  END IF;

  UPDATE public.teacher_profiles
  SET city_id = NEW.city_id,
      in_person_latitude = NEW.latitude,
      in_person_longitude = NEW.longitude,
      in_person_service_radius_km = NEW.service_radius_km,
      in_person_enabled = CASE WHEN v_location_changed THEN false ELSE in_person_enabled END,
      in_person_approval_status = CASE WHEN v_location_changed THEN 'pending' ELSE in_person_approval_status END,
      in_person_rejection_reason = CASE WHEN v_location_changed THEN NULL ELSE in_person_rejection_reason END,
      updated_at = CASE WHEN v_location_changed THEN now() ELSE updated_at END
  WHERE user_id = NEW.teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher profile not found for service location'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_teacher_service_location_to_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_teacher_service_location_to_profile_trigger
  ON public.teacher_service_locations;
CREATE TRIGGER sync_teacher_service_location_to_profile_trigger
AFTER INSERT OR UPDATE OF country_iso2, city_id, street_address, latitude, longitude, service_radius_km
ON public.teacher_service_locations
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_service_location_to_profile();

COMMIT;
