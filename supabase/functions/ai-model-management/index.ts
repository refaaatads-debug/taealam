import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "gemini" | "groq" | "elevenlabs";

const providerMeta: Record<Provider, { name: string; apiVersion: string; env: string; uses: string[] }> = {
  gemini: {
    name: "Google Gemini",
    apiVersion: "v1beta / OpenAI compatible",
    env: "GEMINI_API_KEY",
    uses: ["حل الواجبات", "تصحيح الواجبات", "تقارير الجلسات", "التحليلات", "الملخصات", "كشف المخالفات", "المساعد المباشر"],
  },
  groq: {
    name: "Groq",
    apiVersion: "OpenAI API v1",
    env: "GROQ_API_KEY",
    uses: ["مساعد الدعم الذكي", "المعلم الذكي النصي"],
  },
  elevenlabs: {
    name: "ElevenLabs",
    apiVersion: "API v1",
    env: "ELEVENLABS_API_KEY",
    uses: ["تحويل النص إلى صوت", "تحويل الصوت إلى نص", "المساعد الصوتي المباشر"],
  },
};

const maskKey = (key: string) => key ? `••••••••${key.slice(-4)}` : "";

async function readRuntimeConfig(admin: any, provider: string, envName: string) {
  const { data } = await admin.rpc("get_ai_provider_runtime_config", { p_provider: provider });
  const configured = data || {};
  return {
    ...configured,
    api_key: configured.api_key || Deno.env.get(envName) || "",
  };
}

async function inspectProvider(provider: Provider, apiKey: string) {
  if (!apiKey) return { connected: false, error: "لم يتم إعداد المفتاح", models: [], quota: null };

  if (provider === "groq") {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { connected: false, error: `Groq HTTP ${response.status}`, models: [], quota: null };
    const payload = await response.json();
    return {
      connected: true,
      models: (payload.data || []).map((model: any) => ({
        id: model.id,
        name: model.id,
        version: model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : "—",
        owner: model.owned_by || "—",
        active: model.active !== false,
        inputLimit: model.context_window || null,
        outputLimit: model.max_completion_tokens || null,
        capabilities: /whisper/i.test(model.id) ? ["تحويل صوت إلى نص"] : /orpheus/i.test(model.id) ? ["تحويل نص إلى صوت"] : ["نص", "محادثة"],
      })),
      quota: { available: false, message: "Groq لا يوفّر الرصيد المتبقي عبر Models API؛ تظهر حدود السياق لكل نموذج أدناه." },
    };
  }

  if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) return { connected: false, error: `Gemini HTTP ${response.status}`, models: [], quota: null };
    const payload = await response.json();
    return {
      connected: true,
      models: (payload.models || []).map((model: any) => ({
        id: String(model.name || "").replace(/^models\//, ""),
        name: model.displayName || model.name,
        version: model.version || "—",
        owner: "Google",
        active: (model.supportedGenerationMethods || []).includes("generateContent"),
        inputLimit: model.inputTokenLimit || null,
        outputLimit: model.outputTokenLimit || null,
        capabilities: model.supportedGenerationMethods || [],
      })),
      quota: { available: false, message: "Google لا يعرض الرصيد المتبقي لمفتاح Gemini عبر API؛ المعروض هو حد الرموز لكل طلب." },
    };
  }

  const [modelsResponse, subscriptionResponse] = await Promise.all([
    fetch("https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": apiKey } }),
    fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey } }),
  ]);
  if (!modelsResponse.ok) return { connected: false, error: `ElevenLabs HTTP ${modelsResponse.status}`, models: [], quota: null };
  const models = await modelsResponse.json();
  const subscription = subscriptionResponse.ok ? await subscriptionResponse.json() : null;
  const remaining = subscription ? Math.max(0, Number(subscription.character_limit || 0) - Number(subscription.character_count || 0)) : null;
  return {
    connected: true,
    models: (models || []).map((model: any) => ({
      id: model.model_id,
      name: model.name,
      version: model.model_id,
      owner: "ElevenLabs",
      active: Boolean(model.can_do_text_to_speech || model.can_do_voice_conversion || model.can_do_text_to_voice),
      inputLimit: model.max_characters_request_free_user || model.max_characters_request_subscribed_user || null,
      outputLimit: null,
      capabilities: [
        model.can_do_text_to_speech && "نص إلى صوت",
        model.can_do_voice_conversion && "تحويل صوت",
        model.can_do_text_to_voice && "تصميم صوت",
      ].filter(Boolean),
    })),
    quota: subscription ? {
      available: true,
      unit: "حرف",
      used: Number(subscription.character_count || 0),
      limit: Number(subscription.character_limit || 0),
      remaining,
      resetAt: subscription.next_character_count_reset_unix
        ? new Date(subscription.next_character_count_reset_unix * 1000).toISOString()
        : null,
    } : { available: false, message: "المفتاح يعمل، لكن صلاحية قراءة الاشتراك غير متاحة." },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, serviceKey);
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: role } = await userClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "save_key") {
      const provider = body.provider as Provider | "elevenlabs_backup";
      const apiKey = String(body.api_key || "").trim();
      if (!["gemini", "groq", "elevenlabs", "elevenlabs_backup"].includes(provider) || apiKey.length < 8) {
        return json({ error: "بيانات المفتاح غير صحيحة" }, 400);
      }
      const testProvider = provider === "elevenlabs_backup" ? "elevenlabs" : provider;
      const inspection = await inspectProvider(testProvider as Provider, apiKey);
      if (!inspection.connected) return json({ error: `لم يتم حفظ المفتاح: ${inspection.error}` }, 400);
      const { error } = await userClient.rpc("set_ai_provider_secret", { p_provider: provider, p_secret: apiKey });
      if (error) throw error;
      return json({ success: true, maskedKey: maskKey(apiKey), status: "active" });
    }

    if (action === "save_config") {
      const provider = body.provider as Provider;
      if (!providerMeta[provider]) return json({ error: "مزود غير معروف" }, 400);
      const selectedModel = body.selected_model ? String(body.selected_model) : null;
      if (selectedModel && provider !== "elevenlabs") {
        const runtime = await readRuntimeConfig(admin, provider, providerMeta[provider].env);
        const inspection = await inspectProvider(provider, runtime.api_key);
        const validModel = inspection.models.some((model: any) => model.id === selectedModel && model.active);
        if (!validModel) return json({ error: "النموذج المحدد غير متاح أو غير فعال لدى المزود" }, 400);
      }
      const update = {
        enabled: Boolean(body.enabled),
        selected_model: selectedModel,
        fallback_model: body.fallback_model || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await userClient.from("ai_provider_configs").update(update).eq("provider", provider);
      if (error) throw error;
      return json({ success: true });
    }

    const configsResult = await userClient.from("ai_provider_configs").select("*").order("provider");
    if (configsResult.error) throw configsResult.error;
    const configMap = new Map((configsResult.data || []).map((row: any) => [row.provider, row]));

    const providers = await Promise.all((Object.keys(providerMeta) as Provider[]).map(async (provider) => {
      const meta = providerMeta[provider];
      const runtime = await readRuntimeConfig(admin, provider, meta.env);
      let inspection = await inspectProvider(provider, runtime.api_key);
      let backupMaskedKey = "";
      let activeCredential: "primary" | "backup" | null = inspection.connected ? "primary" : null;
      let warning: string | null = null;
      if (provider === "elevenlabs") {
        const backup = await readRuntimeConfig(admin, "elevenlabs_backup", "ELEVENLABS_API_KEY_BACKUP");
        backupMaskedKey = maskKey(backup.api_key);
        if (!inspection.connected && backup.api_key) {
          const backupInspection = await inspectProvider("elevenlabs", backup.api_key);
          if (backupInspection.connected) {
            warning = `المفتاح الأساسي غير صالح حاليًا (${inspection.error})، ويعمل النظام بالمفتاح الاحتياطي.`;
            inspection = backupInspection;
            activeCredential = "backup";
          }
        }
      }
      return {
        provider,
        ...meta,
        enabled: runtime.enabled !== false,
        selectedModel: runtime.selected_model || null,
        fallbackModel: runtime.fallback_model || null,
        keyConfigured: Boolean(runtime.api_key),
        maskedKey: maskKey(runtime.api_key),
        keySource: runtime.source || "environment",
        backupMaskedKey,
        connected: inspection.connected,
        activeCredential,
        warning,
        error: inspection.error || null,
        models: inspection.models,
        quota: inspection.quota,
        updatedAt: configMap.get(provider)?.updated_at || null,
      };
    }));
    return json({ providers, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("ai-model-management:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});