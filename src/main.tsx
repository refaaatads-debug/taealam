import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { handleOAuthCallback } from "./lib/oauth-callback";

// Process OAuth tokens from URL (Lovable broker redirect) before app mounts.
// Runs in parallel with React rendering — AuthContext will pick up the session.
void handleOAuthCallback();

createRoot(document.getElementById("root")!).render(<App />);
