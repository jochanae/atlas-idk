import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MockApp } from "./MockApp";
import { Showcase } from "./Showcase";
import "./styles.css";

/**
 * Routing:
 *   ?showcase=1                      → static state grid (Showcase)
 *   ?mock=1                          → scripted mock provider + StoryPanel
 *   ?conversation=<uuid> (default)   → live backend (LiveRunProvider)
 *
 * The conversation id can also be supplied via VITE_DEFAULT_CONVERSATION at
 * build time for the live shell.
 */
const params = new URLSearchParams(window.location.search);
const isShowcase = params.has("showcase");
const isMock = params.has("mock");
const conversationId =
  params.get("conversation") ??
  (import.meta.env.VITE_DEFAULT_CONVERSATION as string | undefined) ??
  "";

function Root() {
  if (isShowcase) return <Showcase />;
  if (isMock) return <MockApp />;
  if (!conversationId) return <MissingConversation />;
  return <App conversationId={conversationId} />;
}

function MissingConversation() {
  return (
    <div style={{ padding: 32, color: "var(--text)", fontSize: 14 }}>
      <h2 style={{ margin: "0 0 8px" }}>No conversation selected</h2>
      <p style={{ color: "var(--muted)" }}>
        Append <code>?conversation=&lt;uuid&gt;</code> to the URL to open a live conversation,
        or use <code>?mock=1</code> for the scripted regression shell, or{" "}
        <code>?showcase=1</code> for the state grid.
      </p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
