import type { Session, SupabaseClient } from "@supabase/supabase-js";

type RecoveryAuth = Pick<SupabaseClient["auth"], "exchangeCodeForSession" | "setSession" | "getUser" | "updateUser">;
export type VerifiedPasswordRecovery = { session: Session; userId: string; email: string };

const INVALID_LINK = "تعذر التحقق من رابط الاستعادة. اطلب رابطًا جديدًا وافتحه في المتصفح نفسه الذي طلبته منه.";
const ACCOUNT_CHANGED = "تغيّر الحساب أثناء إعادة التعيين. لم نغيّر كلمة المرور؛ اطلب رابط استعادة جديدًا للحساب المطلوب.";

export function shouldDetectAuthCallback(pathname: string) {
  // The recovery page explicitly consumes its link, never an existing login.
  return pathname.replace(/\/+$/, "") !== "/reset-password";
}

export async function verifyPasswordRecovery(
  auth: RecoveryAuth,
  href: string,
  clearLink: () => void,
): Promise<VerifiedPasswordRecovery> {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("code");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const implicitRecovery = hash.get("type") === "recovery" && accessToken && refreshToken;
  // Remove single-use codes/tokens from the address bar even on failure.
  clearLink();
  if (url.searchParams.has("error") || hash.has("error") || (!code && !implicitRecovery)) {
    throw new Error(INVALID_LINK);
  }

  let session: Session | null;
  if (code) {
    const { data, error } = await auth.exchangeCodeForSession(code);
    // The SDK returns the verifier's redirect type at runtime. Fail closed for
    // OAuth/signup codes; a normal SIGNED_IN session is not recovery proof.
    if (error || !("redirectType" in data) || data.redirectType !== "PASSWORD_RECOVERY") {
      throw new Error(INVALID_LINK);
    }
    session = data.session;
  } else {
    const { data, error } = await auth.setSession({
      access_token: accessToken!,
      refresh_token: refreshToken!,
    });
    if (error) throw new Error(INVALID_LINK);
    session = data.session;
  }
  if (!session) throw new Error(INVALID_LINK);
  const { data, error } = await auth.getUser(session.access_token);
  if (error || !data.user?.email || data.user.id !== session.user.id) throw new Error(INVALID_LINK);
  return { session, userId: data.user.id, email: data.user.email };
}

export async function saveRecoveryPassword(
  currentAuth: Pick<RecoveryAuth, "getUser">,
  isolatedAuth: Pick<RecoveryAuth, "setSession" | "getUser" | "updateUser">,
  recovery: VerifiedPasswordRecovery,
  password: string,
) {
  if (password.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  const current = await currentAuth.getUser();
  if (current.error || current.data.user?.id !== recovery.userId) throw new Error(ACCOUNT_CHANGED);

  // Use only the verified recovery credentials in a non-persistent client.
  // Another tab changing the shared login cannot redirect this write.
  const restored = await isolatedAuth.setSession({
    access_token: recovery.session.access_token,
    refresh_token: recovery.session.refresh_token,
  });
  if (restored.error || restored.data.user?.id !== recovery.userId) throw new Error(ACCOUNT_CHANGED);
  const verified = await isolatedAuth.getUser();
  if (verified.error || verified.data.user?.id !== recovery.userId ||
    verified.data.user.email?.toLowerCase() !== recovery.email.toLowerCase()) {
    throw new Error(ACCOUNT_CHANGED);
  }
  const updated = await isolatedAuth.updateUser({ password });
  if (updated.error) throw updated.error;
  if (updated.data.user?.id !== recovery.userId) throw new Error("تعذر تأكيد حفظ كلمة المرور؛ لا تعتبر العملية ناجحة.");
}
