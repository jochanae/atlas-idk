import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/install-api-fetch";
import { installSwGuard } from "./lib/sw-guard";
import App from "./App";
import "./styles.css";

installSwGuard();

// ?reset clears all Ask Atlas stuck state (conversation ID + project context)
// so the user can get a clean session without clearing browser data manually.
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("reset")) {
  try { localStorage.removeItem("atlas-ask-atlas-conversation-id"); } catch {}
  try { sessionStorage.removeItem("atlas-ask-atlas-conversation-id"); } catch {}
  try { sessionStorage.removeItem("atlas-active-project"); } catch {}
  try { localStorage.removeItem("atlas-ask-atlas-surface-open"); } catch {}
  try { sessionStorage.removeItem("atlas-ask-atlas-closed"); } catch {}
  window.history.replaceState({}, "", window.location.pathname);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

  