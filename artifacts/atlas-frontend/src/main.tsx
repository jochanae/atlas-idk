import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/install-api-fetch";
import { installAttachAudit } from "./lib/attachAuditLog";
import { installSwGuard } from "./lib/sw-guard";
import App from "./App";
import "./styles.css";

installSwGuard();
installAttachAudit();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

  