import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/install-api-fetch";
import { installSwGuard } from "./lib/sw-guard";
import { installDebugGlobals } from "./lib/attachDebugLog";
import App from "./App";
import "./styles.css";

installSwGuard();
installDebugGlobals();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />,
);
