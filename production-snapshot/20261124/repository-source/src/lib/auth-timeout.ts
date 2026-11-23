const DEFAULT_AUTH_TIMEOUT_MS = 15000;

export class AuthTimeoutError extends Error {
  constructor(message = "انتهت مهلة الاتصال بخدمة تسجيل الدخول. حاول مرة أخرى.") {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

export async function withAuthTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_AUTH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new AuthTimeoutError()), timeoutMs);
    }),
  ]);
}

export function getAuthErrorMessage(error: unknown) {
  if (error instanceof AuthTimeoutError) return error.message;

  if (error instanceof Error) {
    if (/failed to fetch/i.test(error.message)) {
      return "تعذر الاتصال بالخادم الآن. تحقق من الشبكة ثم أعد المحاولة.";
    }

    return error.message;
  }

  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}