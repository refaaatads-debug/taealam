INSERT INTO public.site_settings (key, value, category, type, label_ar)
VALUES ('site_name', 'منصة أجيال المعرفة', 'header', 'text', 'اسم الموقع')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();