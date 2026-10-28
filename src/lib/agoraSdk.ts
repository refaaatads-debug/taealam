type AgoraSdk = typeof import("agora-rtc-sdk-ng")["default"];
let loading: Promise<AgoraSdk> | undefined;

/** Public pages do not need the RTC SDK. Load it only when a call uses Agora. */
export function loadAgoraSdk(): Promise<AgoraSdk> {
  if (!loading) {
    loading = import("agora-rtc-sdk-ng").then((module) => module.default).catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
