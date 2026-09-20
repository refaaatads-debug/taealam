const DEFAULT_MESSAGE = "تعذر إكمال العملية. حاول مرة أخرى.";

/**
 * Keep backend/provider details out of user-facing notifications.
 * Detailed errors remain available to internal server-side logging.
 */
export function safeErrorMessage(_error: unknown, fallback = DEFAULT_MESSAGE): string {
  return fallback;
}