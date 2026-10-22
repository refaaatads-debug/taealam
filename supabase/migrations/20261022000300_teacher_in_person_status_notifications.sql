CREATE OR REPLACE FUNCTION public.notify_teacher_in_person_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  notification_title text;
  notification_body text;
  notification_type text;
BEGIN
  IF NEW.in_person_approval_status IS DISTINCT FROM OLD.in_person_approval_status THEN
    IF NEW.in_person_approval_status = 'approved' THEN
      notification_title := '✅ تم اعتماد التدريس الحضوري';
      notification_body := 'وافقت الإدارة على طلبك للتدريس الحضوري. راجع ملفك لمعرفة إعدادات استقبال الحجوزات.';
      notification_type := 'teacher_in_person_approval';
    ELSIF NEW.in_person_approval_status = 'rejected' THEN
      notification_title := 'لم تتم الموافقة على طلب التدريس الحضوري';
      notification_body := CASE
        WHEN NULLIF(btrim(NEW.in_person_rejection_reason), '') IS NOT NULL
          THEN 'سبب الرفض: ' || btrim(NEW.in_person_rejection_reason)
        ELSE 'يمكنك مراجعة بيانات خدمة التعليم الحضوري في ملفك.'
      END;
      notification_type := 'teacher_in_person_approval';
    END IF;
  ELSIF NEW.in_person_approval_status = 'approved'
        AND NEW.in_person_enabled IS DISTINCT FROM OLD.in_person_enabled THEN
    IF NEW.in_person_enabled THEN
      notification_title := '📍 تم تفعيل استقبال الحجوزات الحضورية';
      notification_body := 'فعّلت الإدارة استقبال طلبات الحجز الحضوري على حسابك.';
    ELSE
      notification_title := 'تم إيقاف استقبال الحجوزات الحضورية';
      notification_body := 'أوقفت الإدارة استقبال طلبات الحجز الحضوري على حسابك. لا يؤثر ذلك في حجوزاتك السابقة.';
    END IF;
    notification_type := 'teacher_in_person_availability';
  END IF;

  IF notification_title IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (NEW.user_id, notification_title, notification_body, notification_type, '/profile');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_teacher_in_person_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teacher_in_person_status_notification_trigger ON public.teacher_profiles;
CREATE TRIGGER teacher_in_person_status_notification_trigger
  AFTER UPDATE OF in_person_approval_status, in_person_enabled
  ON public.teacher_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_teacher_in_person_status_change();
