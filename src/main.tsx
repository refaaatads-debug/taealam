// v1778408831 — cache bust
import { createRoot } from "react-dom/client";

// ── Stale-chunk guard ──────────────────────────────────────────────────────
// After a new deploy the browser may still hold the old HTML which references
// chunk hashes that no longer exist on the server.  When React tries to
// lazy-load one of those chunks it fails with a dynamic-import error and
// the app shows a blank white page.
// Listening to vite:preloadError and reloading once is enough to pick up
// the new manifest without the user noticing anything.
window.addEventListener("vite:preloadError", () => {
  const reloaded = sessionStorage.getItem("_chunk_reload");
  if (!reloaded) {
    sessionStorage.setItem("_chunk_reload", "1");
    window.location.reload();
  } else {
    // Second consecutive failure — clear flag to avoid infinite loop.
    sessionStorage.removeItem("_chunk_reload");
  }
});
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { handleOAuthCallback } from "./lib/oauth-callback";

// Start OAuth callback processing immediately, but never block app boot on it.
// Waiting here can freeze the whole app if the callback session write is slow.
void handleOAuthCallback();

createRoot(document.getElementById("root")!).render(<HelmetProvider><App /></HelmetProvider>);
