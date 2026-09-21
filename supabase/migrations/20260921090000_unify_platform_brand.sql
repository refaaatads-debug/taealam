UPDATE public.site_settings
SET value = 'منصة أجيال المعرفة',
    updated_at = now()
WHERE key = 'site_name';

UPDATE public.site_settings
SET value = '© 2026 منصة أجيال المعرفة. جميع الحقوق محفوظة.',
    updated_at = now()
WHERE key = 'footer_copyright';