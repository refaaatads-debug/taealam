
INSERT INTO public.site_settings (key, value, type, label_ar, category) VALUES
-- Header settings
('site_name', 'تعلم المستقبل', 'text', 'اسم الموقع', 'header'),
('header_login_text', 'تسجيل الدخول', 'text', 'نص زر تسجيل الدخول', 'header'),
('header_cta_text', 'ابدأ مجاناً', 'text', 'نص زر البدء', 'header'),
('header_search_text', 'ابحث عن مدرس', 'text', 'نص رابط البحث', 'header'),
('header_pricing_text', 'الباقات', 'text', 'نص رابط الباقات', 'header'),
('header_logo', NULL, 'image', 'شعار الموقع', 'header'),
-- Footer settings
('footer_description', 'منصة تعليمية ذكية تربط الطلاب بأفضل المدرسين في السعودية والوطن العربي، مدعومة بالذكاء الاصطناعي.', 'text', 'وصف الفوتر', 'footer'),
('footer_email', 'info@taallam.com', 'text', 'البريد الإلكتروني', 'footer'),
('footer_phone', '+966 50 000 0000', 'text', 'رقم الهاتف', 'footer'),
('footer_address', 'الرياض، المملكة العربية السعودية', 'text', 'العنوان', 'footer'),
('footer_copyright', '© 2026 تعلم المستقبل. جميع الحقوق محفوظة.', 'text', 'نص حقوق الملكية', 'footer'),
('footer_made_with', 'صُنع بـ ❤️ في السعودية', 'text', 'نص صُنع بـ', 'footer'),
('footer_twitter_url', '', 'text', 'رابط تويتر', 'footer'),
('footer_linkedin_url', '', 'text', 'رابط لينكدإن', 'footer'),
('footer_youtube_url', '', 'text', 'رابط يوتيوب', 'footer')
ON CONFLICT (key) DO NOTHING;
