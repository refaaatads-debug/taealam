INSERT INTO public.site_settings (key, category, label_ar, type, value)
VALUES 
  ('ai_tutor_agent_id', 'ai', 'معرّف وكيل ElevenLabs للمحادثة الصوتية', 'text', ''),
  ('ai_tutor_voice_id', 'ai', 'معرّف الصوت لنطق الردود (TTS)', 'text', 'EXAVITQu4vr4xnSDxMaL'),
  ('ai_tutor_enabled', 'ai', 'تفعيل المساعد الصوتي', 'text', 'true')
ON CONFLICT (key) DO NOTHING;