CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
  provider text PRIMARY KEY CHECK (provider IN ('gemini', 'groq', 'elevenlabs')),
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  selected_model text,
  fallback_model text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.ai_provider_configs TO authenticated;
GRANT ALL ON public.ai_provider_configs TO service_role;

DROP POLICY IF EXISTS "Admins can view AI provider configs" ON public.ai_provider_configs;
CREATE POLICY "Admins can view AI provider configs"
ON public.ai_provider_configs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can manage AI provider configs" ON public.ai_provider_configs;
CREATE POLICY "Admins can manage AI provider configs"
ON public.ai_provider_configs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.ai_provider_configs (provider, display_name)
VALUES
  ('gemini', 'Google Gemini'),
  ('groq', 'Groq'),
  ('elevenlabs', 'ElevenLabs')
ON CONFLICT (provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_ai_provider_secret(
  p_provider text,
  p_secret text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_provider NOT IN ('gemini', 'groq', 'elevenlabs', 'elevenlabs_backup') THEN
    RAISE EXCEPTION 'Unsupported provider';
  END IF;
  IF length(trim(p_secret)) < 8 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;

  v_name := 'ai_provider_' || p_provider || '_api_key';
  SELECT id INTO v_id FROM vault.decrypted_secrets WHERE name = v_name LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(trim(p_secret), v_name, 'Managed from the AI Models admin panel');
  ELSE
    PERFORM vault.update_secret(v_id, trim(p_secret), v_name, 'Managed from the AI Models admin panel');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_provider_runtime_config(
  p_provider text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
  v_enabled boolean := true;
  v_model text;
  v_fallback text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ai_provider_' || p_provider || '_api_key'
  LIMIT 1;

  SELECT enabled, selected_model, fallback_model
  INTO v_enabled, v_model, v_fallback
  FROM public.ai_provider_configs
  WHERE provider = CASE WHEN p_provider = 'elevenlabs_backup' THEN 'elevenlabs' ELSE p_provider END;

  RETURN jsonb_build_object(
    'api_key', v_secret,
    'enabled', COALESCE(v_enabled, true),
    'selected_model', v_model,
    'fallback_model', v_fallback,
    'source', CASE WHEN v_secret IS NULL THEN 'environment' ELSE 'vault' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_ai_provider_secret(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_provider_secret(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_ai_provider_runtime_config(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_provider_runtime_config(text) TO service_role;

NOTIFY pgrst, 'reload schema';