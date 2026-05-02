import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { handleOAuthCallback } from "./lib/oauth-callback";

// Process OAuth tokens from URL (Lovable Cloud broker redirect) before app mounts.
// Rendering in parallel can race with getSession()/onAuthStateChange and drop the
// first authenticated render after returning from Google/Apple.
void handleOAuthCallback().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
