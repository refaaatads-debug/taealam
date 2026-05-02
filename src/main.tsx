import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { handleOAuthCallback } from "./lib/oauth-callback";

// Start OAuth callback processing immediately, but never block app boot on it.
// Waiting here can freeze the whole app if the callback session write is slow.
void handleOAuthCallback();

createRoot(document.getElementById("root")!).render(<App />);
