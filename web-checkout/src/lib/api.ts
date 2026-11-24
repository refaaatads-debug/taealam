import { supabase } from "@/integrations/supabase/client";

/** Invoke edge function with built-in error handling & timeout */
export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
  options?: { timeout?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 30000);

  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body,
    });
    if (error) throw error;
    return data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Simple client-side rate limiter */
const rateLimits = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = (rateLimits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  rateLimits.set(key, timestamps);
  return true;
}
