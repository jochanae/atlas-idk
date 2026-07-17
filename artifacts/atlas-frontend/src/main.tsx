import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/install-api-fetch";
import { installAttachAudit } from "./lib/attachAuditLog";
import { installSwGuard } from "./lib/sw-guard";
import { loadServerCapabilities } from "./lib/attachments/flags";
import App from "./App";
import "./styles.css";

installSwGuard();
installAttachAudit();

// Fetch server capabilities once at startup (fire-and-forget).
// isAttachmentFlagOn() falls back to build-time values until this resolves.
void loadServerCapabilities();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
