-- Create site_settings table for CMS
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  type text NOT NULL DEFAULT 'text',
  label_ar text,
  category text NOT NULL DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read site settings
CREATE POLICY "Site settings are public"
ON public.site_settings FOR SELECT
USING (true);

-- Only admins can manage site settings
CREATE POLICY "Admins can manage site settings"
ON public.site_settings FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_site_settings_updated_at
BEFORE UPDATE ON public.site_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for site assets
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true);

-- Storage policies
CREATE POLICY "Site assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'site-assets');

CREATE POLICY "Admins can upload site assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update site assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete site assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-assets' AND has_role(auth.uid(), 'admin'::app_role));

-- Insert default homepage content
INSERT INTO public.site_settings (key, value, type, label_ar, category) VALUES
  ('hero_title', 'تعلّم مع أفضل المعلمين', 'text', 'عنوان البانر الرئيسي', 'homepage'),
  ('hero_subtitle', 'منصة تعليمية متكاملة تربط الطلاب بأفضل المعلمين المعتمدين', 'text', 'النص الفرعي للبانر', 'homepage'),
  ('hero_cta_text', 'ابدأ رحلتك التعليمية', 'text', 'نص زر البانر', 'homepage'),
  ('hero_image', '', 'image', 'صورة البانر الرئيسي', 'homepage'),
  ('features_title', 'لماذا تختار تعلّم؟', 'text', 'عنوان قسم المميزات', 'homepage'),
  ('feature_1_title', 'معلمين معتمدين', 'text', 'عنوان الميزة 1', 'homepage'),
  ('feature_1_desc', 'جميع المعلمين تم التحقق من مؤهلاتهم وخبراتهم', 'text', 'وصف الميزة 1', 'homepage'),
  ('feature_2_title', 'حصص تفاعلية', 'text', 'عنوان الميزة 2', 'homepage'),
  ('feature_2_desc', 'حصص مباشرة عبر الفيديو مع أدوات تعليمية متقدمة', 'text', 'وصف الميزة 2', 'homepage'),
  ('feature_3_title', 'مدرس ذكاء اصطناعي', 'text', 'عنوان الميزة 3', 'homepage'),
  ('feature_3_desc', 'مساعد تعليمي بالذكاء الاصطناعي متاح على مدار الساعة', 'text', 'وصف الميزة 3', 'homepage'),
  ('about_text', 'منصة تعلّم هي وجهتك المثالية للتعليم الخصوصي عبر الإنترنت', 'text', 'نص عن المنصة', 'homepage'),
  ('footer_text', 'جميع الحقوق محفوظة © تعلّم 2026', 'text', 'نص التذييل', 'general'),
  ('contact_email', 'support@taealam.com', 'text', 'البريد الإلكتروني للتواصل', 'general'),
  ('contact_phone', '', 'text', 'رقم الهاتف للتواصل', 'general');
