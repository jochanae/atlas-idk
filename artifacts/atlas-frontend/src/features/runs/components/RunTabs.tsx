import { useState } from "react";
import type { Run } from "../types";
import { AppliedFileRow } from "./AppliedFileRow";
import { BlockedFileCard } from "./BlockedFileCard";

type Tab = "chat" | "shell" | "files";

interface Props {
  run: Run;
}

export function RunTabs({ run }: Props) {
  const [tab, setTab] = useState<Tab>(
    run.counts.blocked > 0 ? "files" : "chat"
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: "CHAT" },
    { id: "shell", label: "SHELL" },
    { id: "files", label: "FILES" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex", gap: 4,
        borderBottom: "0.5px solid var(--atlas-border)",
      }}>
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                borderBottom: active ? "1.5px solid var(--atlas-gold)" : "1.5px solid transparent",
                color: active ? "var(--atlas-fg)" : "var(--atlas-muted, rgba(255,255,255,0.45))",
                fontFamily: "var(--app-font-mono)", fontSize: 10,
                letterSpacing: "0.16em", fontWeight: active ? 700 : 500,
                cursor: "pointer",
                marginBottom: -0.5,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "chat" && <ChatTab run={run} />}
      {tab === "shell" && <ShellTab run={run} />}
      {tab === "files" && <FilesTab run={run} />}
    </div>
  );
}

function ChatTab({ run }: { run: Run }) {
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 8,
      border: "0.5px solid var(--atlas-border)",
      background: "rgba(255,255,255,0.015)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9,
        letterSpacing: "0.18em", color: "var(--atlas-muted, rgba(255,255,255,0.45))",
      }}>
        ORIGINATING PROMPT
      </div>
      <div style={{
        fontSize: 13, color: "var(--atlas-fg)", lineHeight: 1.55,
        whiteSpace: "pre-wrap",
      }}>
        {run.intent}
      </div>
      {run.streamedContent && (
        <>
          <div style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9,
            letterSpacing: "0.18em", color: "var(--atlas-muted, rgba(255,255,255,0.45))",
            marginTop: 6,
          }}>
            ATLAS REPLY
          </div>
          <div style={{
            fontSize: 13, color: "var(--atlas-fg)", lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}>
            {run.streamedContent}
          </div>
        </>
      )}
    </div>
  );
}

function ShellTab({ run }: { run: Run }) {
  if (!run.shellLines || run.shellLines.length === 0) {
    return (
      <EmptyPanel text="No shell output captured for this run." />
    );
  }
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      border: "0.5px solid var(--atlas-border)",
      background: "rgba(0,0,0,0.30)",
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      {run.shellLines.map((l, i) => (
        <div key={i} style={{
          fontFamily: "var(--app-font-mono)", fontSize: 10.5,
          color: l.kind === "err"
            ? "rgba(248,113,113,0.85)"
            : l.kind === "cmd"
              ? "var(--atlas-gold)"
              : "var(--atlas-fg)",
          whiteSpace: "pre-wrap", lineHeight: 1.5,
        }}>
          {l.kind === "cmd" ? "$ " : ""}{l.text}
        </div>
      ))}
    </div>
  );
}

function FilesTab({ run }: { run: Run }) {
  if (run.files.length === 0) {
    return <EmptyPanel text="No files touched by this run." />;
  }
  const blocked = run.files.filter((f) => f.state === "blocked");
  const applied = run.files.filter((f) => f.state === "applied");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {blocked.length > 0 && (
        <Section label={`BLOCKED FILES (${blocked.length})`}>
          {blocked.map((f) => (
            <BlockedFileCard
              key={f.path}
              file={f}
              retryDisabled
              retryTitle="Retry coming in next pass"
            />
          ))}
        </Section>
      )}
      {applied.length > 0 && (
        <Section label={`APPLIED FILES (${applied.length})`}>
          {applied.map((f) => (
            <AppliedFileRow key={f.path} path={f.path} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 9,
        letterSpacing: "0.18em", color: "var(--atlas-muted, rgba(255,255,255,0.45))",
        padding: "0 2px",
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div style={{
      padding: "20px 16px",
      borderRadius: 8,
      border: "0.5px dashed var(--atlas-border)",
      background: "transparent",
      textAlign: "center",
      fontFamily: "var(--app-font-mono)", fontSize: 11,
      color: "var(--atlas-muted, rgba(255,255,255,0.45))",
      letterSpacing: "0.04em",
    }}>
      {text}
    </div>
  );
}
