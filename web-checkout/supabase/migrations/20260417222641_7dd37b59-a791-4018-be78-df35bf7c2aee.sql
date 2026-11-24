INSERT INTO public.site_settings (key, value, label_ar, category, type)
VALUES ('call_price_per_minute', '0.30', 'سعر الدقيقة للمكالمة الهاتفية (ر.س)', 'pricing', 'number')
ON CONFLICT (key) DO NOTHING;