// Keep signed-out access aligned with the public routes in App.tsx.
// This only controls the expired-session redirect. ProtectedRoute and database
// access policies still enforce authentication and roles on private pages.
export const PUBLIC_AUTH_PATHS = [
  "/", "/login", "/register", "/signup", "/teacher-register", "/teacher-signup",
  "/admin-login", "/forgot-password", "/reset-password", "/search", "/packages",
  "/teach-with-us", "/install", "/faq", "/help", "/privacy", "/terms",
  "/delete-account", "/refund",
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
