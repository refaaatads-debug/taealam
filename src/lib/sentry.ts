import * as Sentry from "@sentry/react";

// Error tracking (Sentry). Errors only: no tracing, no session replay, no personal data.
// It must never break the app, so everything is wrapped and runs in production only.
const DSN =
  "https://dcecad9f78aef37bac03ae0dd4aecacb@o4512493981270016.ingest.de.sentry.io/4512493984481360";

try {
  if (import.meta.env.PROD && typeof window !== "undefined") {
    Sentry.init({
      dsn: DSN,
      environment: "production",
      tracesSampleRate: 0,
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications.",
        "Non-Error promise rejection captured",
        "Failed to fetch",
        "Load failed",
        "NetworkError when attempting to fetch resource.",
      ],
    });
  }
} catch {
  // never let monitoring affect the platform
}
