type CatalogCache = {
  expiresAt: number;
  models: string[];
};

type RuntimeConfig = {
  api_key?: string | null;
  enabled?: boolean;
  selected_model?: string | null;
  fallback_model?: string | null;
  source?: "vault" | "environment";
};

let groqCache: CatalogCache | null = null;
let geminiCache: CatalogCache | null = null;
const runtimeCache = new Map<string, { expiresAt: number; value: RuntimeConfig }>();

const CACHE_TTL_MS = 10 * 60 * 1000;

const isTextModel = (id: string) =>
  !/(whisper|prompt-guard|orpheus|safeguard)/i.test(id);

async function getRuntimeConfig(provider: string): Promise<RuntimeConfig> {
  const cached = runtimeCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return {};
  try {
    const response = await fetch(`${url}/rest/v1/rpc/get_ai_provider_runtime_config`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_provider: provider }),
    });
    if (!response.ok) throw new Error(`Runtime config returned ${response.status}`);
    const value = await response.json() as RuntimeConfig;
    runtimeCache.set(provider, { expiresAt: Date.now() + 5_000, value });
    return value;
  } catch (error) {
    console.warn(`AI runtime config unavailable for ${provider}; using environment:`, error);
    return {};
  }
}

export async function getProviderApiKey(provider: string, environmentName: string): Promise<string> {
  const config = await getRuntimeConfig(provider);
  if (config.enabled === false) return "";
  return config.api_key?.trim() || Deno.env.get(environmentName)?.trim() || "";
}

async function readCatalog(url: string, headers: Record<string, string>): Promise<string[]> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Model catalog returned ${response.status}`);
  const payload = await response.json();
  return (payload?.data || payload?.models || [])
    .filter((model: any) => model?.active !== false)
    .filter((model: any) => !model?.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent"))
    .map((model: any) => String(model?.id || model?.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

/**
 * Reads the provider catalog periodically instead of keeping retired model ids
 * in every function. Environment overrides remain useful for pinning a model
 * during a provider incident.
 */
export async function getGroqModels(apiKey: string): Promise<string[]> {
  const runtime = await getRuntimeConfig("groq");
  const override = runtime.selected_model?.trim() || Deno.env.get("GROQ_MODEL")?.trim();
  const now = Date.now();
  if (!apiKey) return override ? [override] : [];
  if (!groqCache || groqCache.expiresAt <= now) {
    try {
      const catalog = await readCatalog("https://api.groq.com/openai/v1/models", {
        Authorization: `Bearer ${apiKey}`,
      });
      groqCache = { expiresAt: now + CACHE_TTL_MS, models: catalog.filter(isTextModel) };
      console.log("Groq catalog refreshed:", groqCache.models.join(", "));
    } catch (error) {
      console.warn("Groq catalog refresh failed; using safe defaults:", error);
      groqCache = {
        expiresAt: now + 60_000,
        models: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"],
      };
    }
  }

  const preferred = [
    override,
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-20b",
    "groq/compound",
  ].filter((model): model is string => Boolean(model));
  return [...new Set([...preferred.filter((model) => groqCache!.models.includes(model)), ...groqCache!.models])];
}

export async function getGeminiModel(apiKey: string): Promise<string> {
  const runtime = await getRuntimeConfig("gemini");
  const override = runtime.selected_model?.trim() || Deno.env.get("GEMINI_MODEL")?.trim();
  const now = Date.now();
  if (!apiKey) return override || "gemini-2.5-flash";
  if (!geminiCache || geminiCache.expiresAt <= now) {
    try {
      const catalog = await readCatalog(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        {},
      );
      const usable = catalog.filter((id) => id.startsWith("gemini-"));
      geminiCache = { expiresAt: now + CACHE_TTL_MS, models: usable };
      console.log("Gemini catalog refreshed:", usable.join(", "));
    } catch (error) {
      console.warn("Gemini catalog refresh failed; using safe default:", error);
      geminiCache = { expiresAt: now + 60_000, models: ["gemini-2.5-flash"] };
    }
  }

  const candidates = [
    override,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ].filter((model): model is string => Boolean(model));
  return candidates.find((model) => geminiCache!.models.includes(model)) || geminiCache.models[0] || "gemini-2.5-flash";
}