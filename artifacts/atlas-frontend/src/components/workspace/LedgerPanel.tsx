import { useState, useEffect, useCallback } from "react";
import { Entry, useCreateEntry, useGetProject, getGetProjectQueryKey, getListEntriesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { StatusGlyph } from "../StatusGlyph";
import { CapsuleTag } from "../CapsuleTag";
import { dispatchVerifyRun, isVerificationEntry, isVerificationFailed, parseVerificationMeta } from "@/lib/verification";
import { useWorkspaceEvent } from "@/lib/workspaceEventBus";


interface VaultSave {
  id: number;
  projectId: number | null;
  projectName: string;
  title: string;
  content: string;
  entryCount: number;
  tags: string[] | null;
  createdAt: string;
}

function formatSnapshotDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

function LedgerEntry({ entry, projectId }: { entry: Entry; projectId: number }) {
  const committed = entry.status === "committed";
  const severity = entry.severity as "blocker" | "parked" | "committed" | "neutral";
  const verification = parseVerificationMeta(entry);
  const isBuild = (entry.mode ?? "").toUpperCase() === "BUILD";

  const wrapperGradient = committed
    ? `linear-gradient(135deg,
        color-mix(in oklab, var(--atlas-gold) 55%, transparent) 0%,
        color-mix(in oklab, var(--atlas-gold) 18%, transparent) 28%,
        transparent 55%,
        color-mix(in oklab, var(--atlas-bg) 80%, transparent) 100%)`
    : `linear-gradient(135deg,
        color-mix(in oklab, var(--atlas-gold) 22%, transparent) 0%,
        color-mix(in oklab, var(--atlas-border) 70%, transparent) 60%,
        transparent 100%)`;

  const wrapperShadow = committed
    ? `0 1px 0 0 color-mix(in oklab, var(--atlas-gold) 8%, transparent) inset, 0 12px 32px -18px rgba(0,0,0,0.55)`
    : `0 6px 20px -14px rgba(0,0,0,0.4)`;

  const innerBg = committed
    ? "color-mix(in oklab, var(--atlas-bg) 92%, var(--atlas-surface))"
    : "var(--atlas-surface)";

  return (
    <article
      style={{
        padding: "0.5px", borderRadius: 6, marginBottom: 6,
        background: wrapperGradient,
        boxShadow: wrapperShadow,
      }}
    >
      <div
        style={{
          background: innerBg,
          borderRadius: 5.5,
          overflow: "hidden",
          backdropFilter: committed ? "blur(18px)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 13px 8px" }}>
          <div style={{ paddingTop: 2, flexShrink: 0 }}>
            <StatusGlyph severity={severity} verb={entry.verb} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
              <Link
                href={`/entry/${entry.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em",
                  color: committed ? "var(--atlas-fg)" : "var(--atlas-muted)",
                  textDecoration: "none",
                }}
              >
                {entry.title}
              </Link>
              {committed && <CapsuleTag severity="committed" size="xs">LOCKED</CapsuleTag>}
              {entry.deviation && <CapsuleTag severity="blocker" size="xs">SHIFTED</CapsuleTag>}
            </div>
          </div>
        </div>

        {entry.summary && (
          <div style={{ padding: "0 13px 9px 37px" }}>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--atlas-muted)" }}>
              {entry.summary}
            </p>
          </div>
        )}

        <div style={{
          margin: "0 13px", height: 1,
          background: "linear-gradient(to right, transparent, var(--atlas-border), transparent)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 13px 7px" }}>
          <span style={{
            fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--atlas-muted)", opacity: 0.45,
          }}>
            {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          {entry.mode && (
            <span style={{
              marginLeft: "auto",
              fontFamily: "var(--app-font-mono)", fontSize: 8.5, letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "2px 6px", borderRadius: 2,
              background: "color-mix(in oklab, var(--atlas-gold) 10%, transparent)",
              border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 20%, var(--atlas-border))",
              color: "var(--atlas-gold)",
            }}              >
              {verification ? "Verified" : entry.mode}
            </span>
          )}
        </div>

        {(isBuild && committed) && (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 13px 8px 37px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {["View Changes", "Preview", "Type Check", "Tests"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === "View Changes") {
                    window.dispatchEvent(new CustomEvent("axiom:open-changes", { detail: { buildEntryId: entry.id } }));
                  } else if (label === "Preview") {
                    window.dispatchEvent(new CustomEvent("axiom:open-preview", { detail: { buildEntryId: entry.id } }));
                  } else if (label === "Type Check") {
                    dispatchVerifyRun("typecheck", projectId, String(entry.id));
                  } else if (label === "Tests") {
                    dispatchVerifyRun("test", projectId, String(entry.id));
                  }
                }}
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "0.5px solid color-mix(in oklab, var(--atlas-gold) 35%, var(--atlas-border))",
                  background: "transparent",
                  color: "var(--atlas-gold)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function LedgerPanel({
  projectId,
  entries,
}: {
  projectId: number;
  entries: Entry[];
}) {

  const allCommitted = entries.filter((e) => e.status === "committed");
  const inTension = allCommitted.filter((e) => isVerificationFailed(e));
  const committedCleanDisplay = allCommitted.filter((e) => !e.deviation && !isVerificationFailed(e));
  const overridden = allCommitted.filter((e) => e.deviation);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const createEntry = useCreateEntry();
  const queryClient = useQueryClient();
  const { data: ledgerProject } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });

  // Subscribe to the event bus so any entry mutation (commit, park, extract)
  // triggers an immediate refetch — no more 30s stale window.
  useWorkspaceEvent("entry-changed", ({ projectId: changedPid }) => {
    if (changedPid === projectId) {
      void queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(projectId, {}) });
    }
  }, [projectId, queryClient]);

  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultSaved, setVaultSaved] = useState(false);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [ledgerTab, setLedgerTab] = useState<"activity" | "snapshots">("activity");

  // ── Snapshots tab state ─────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<VaultSave[]>([]);
  const [snapsLoading, setSnapsLoading] = useState(false);
  const [snapsExpandedId, setSnapsExpandedId] = useState<number | null>(null);
  const [snapsCopiedId, setSnapsCopiedId] = useState<number | null>(null);
  const [snapsConfirmDeleteId, setSnapsConfirmDeleteId] = useState<number | null>(null);
  const [snapsDeletingId, setSnapsDeletingId] = useState<number | null>(null);

  const loadSnapshots = useCallback(async () => {
    setSnapsLoading(true);
    try {
      const res = await fetch("/api/vault");
      if (res.ok) {
        const data: VaultSave[] = await res.json();
        setSnapshots(data.filter((s) => s.projectId === projectId));
      }
    } finally {
      setSnapsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (ledgerTab === "snapshots") loadSnapshots();
  }, [ledgerTab, loadSnapshots]);

  const handleSnapsCopy = async (item: VaultSave) => {
    try {
      await navigator.clipboard.writeText(item.content);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = item.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setSnapsCopiedId(item.id);
    setTimeout(() => setSnapsCopiedId(null), 2000);
  };

  const handleSnapsDelete = async (id: number) => {
    setSnapsDeletingId(id);
    try {
      const res = await fetch(`/api/vault/${id}`, { method: "DELETE" });
      if (res.ok) setSnapshots((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setSnapsDeletingId(null);
      setSnapsConfirmDeleteId(null);
    }
  };

  const handleSaveToVault = async () => {
    if (vaultSaving || allCommitted.length === 0) return;
    setVaultSaving(true);
    const projectName = ledgerProject?.name ?? "Unknown Project";
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const title = `${projectName} — ${dateStr}`;
    const tagSet = new Set<string>();
    const lines = allCommitted.map((e) => {
      if (e.mode) tagSet.add(e.mode.toUpperCase());
      return `• ${e.title}${e.summary ? `\n  ${e.summary}` : ""}`;
    });
    const content = `Decision Ledger Snapshot — ${projectName}\n${dateStr}\n\n${lines.join("\n\n")}`;
    try {
      await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          projectName,
          title,
          content,
          entryCount: allCommitted.length,
          tags: tagSet.size > 0 ? Array.from(tagSet) : null,
        }),
      });
      setVaultSaved(true);
      setTimeout(() => setVaultSaved(false), 2500);
      if (ledgerTab === "snapshots") loadSnapshots();
    } finally {
      setVaultSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createEntry.mutate(
      { projectId, data: { title: newTitle.trim(), status: "committed", severity: "committed", mode: "decide" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(projectId, {}) });
          setNewTitle(""); setShowAdd(false);
        },
      }
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", flexShrink: 0,
        borderBottom: "1px solid var(--atlas-border)",
        padding: "0 12px",
        gap: 2,
      }}>
        {(["activity", "snapshots"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setLedgerTab(tab)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "9px 10px 8px",
              fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: ledgerTab === tab ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb),0.5)",
              borderBottom: `2px solid ${ledgerTab === tab ? "var(--atlas-gold)" : "transparent"}`,
              marginBottom: -1,
              transition: "color 140ms, border-color 140ms",
            }}
          >
            {tab === "activity" ? "Activity" : `Snapshots${snapshots.length > 0 ? ` · ${snapshots.length}` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Activity tab ─────────────────────────────────────────────────────── */}
      {ledgerTab === "activity" && (
        <>
          {showAdd && (
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--atlas-border)", flexShrink: 0 }}>
              <input
                autoFocus value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setShowAdd(false); setNewTitle(""); }
                }}
                placeholder="Decision title…"
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, marginBottom: 6,
                  background: "var(--atlas-surface)", border: "1px solid var(--atlas-border)",
                  color: "var(--atlas-fg)", fontSize: 12, outline: "none",
                  fontFamily: "var(--app-font-sans)", transition: "border-color 160ms ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--atlas-border)")}
              />
              <button
                onClick={handleAdd} disabled={createEntry.isPending}
                style={{
                  width: "100%", padding: "7px", borderRadius: 6,
                  background: "var(--atlas-ember)", border: "none",
                  color: "var(--atlas-fg)", fontSize: 11,
                  fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                  cursor: createEntry.isPending ? "not-allowed" : "pointer",
                  opacity: createEntry.isPending ? 0.6 : 1,
                }}
              >
                Commit
              </button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }} className="scrollbar-none">
            {entries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 12px", color: "var(--atlas-muted)", fontSize: 12, opacity: 0.5, lineHeight: 1.65 }}>
                Decisions made during your session will appear here.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: "var(--atlas-phosphor)", boxShadow: "0 0 6px color-mix(in oklab, var(--atlas-phosphor) 55%, transparent)" }} />
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--atlas-phosphor)" }}>
                      Committed
                    </span>
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--atlas-muted)", marginLeft: "auto" }}>
                      {committedCleanDisplay.length}
                    </span>
                  </div>
                  {committedCleanDisplay.length > 0 ? (
                    committedCleanDisplay.map((e) => <LedgerEntry key={e.id} entry={e} projectId={projectId} />)
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.45, padding: "6px 2px", lineHeight: 1.55 }}>
                      No committed decisions yet.
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: "var(--atlas-ember)", boxShadow: "0 0 6px color-mix(in oklab, var(--atlas-ember) 45%, transparent)" }} />
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--atlas-ember)" }}>
                      In Tension
                    </span>
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--atlas-muted)", marginLeft: "auto" }}>
                      {inTension.length}
                    </span>
                  </div>
                  {inTension.length > 0 ? (
                    inTension.map((e) => <LedgerEntry key={e.id} entry={e} projectId={projectId} />)
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, padding: "6px 2px", lineHeight: 1.55 }}>
                      No open tensions.
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: "var(--atlas-muted)", opacity: 0.5 }} />
                    <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--atlas-muted)", opacity: 0.65 }}>
                      Overridden
                    </span>
                    {overridden.length > 0 && (
                      <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--atlas-muted)", opacity: 0.5, marginLeft: "auto" }}>
                        {overridden.length}
                      </span>
                    )}
                  </div>
                  {overridden.length > 0 ? (
                    <div style={{ opacity: 0.65 }}>
                      {overridden.map((e) => <LedgerEntry key={e.id} entry={e} projectId={projectId} />)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--atlas-muted)", opacity: 0.4, padding: "6px 2px", lineHeight: 1.55 }}>
                      Nothing overridden.
                    </div>
                  )}
                </div>

              </>
            )}
          </div>

          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--atlas-border)", display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => setShowAdd(!showAdd)}
              style={{
                width: "100%", padding: "7px", borderRadius: 6,
                background: "transparent",
                border: "1px dashed rgba(201,162,76,0.2)",
                color: "var(--atlas-muted)", fontSize: 11,
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer", opacity: 0.65,
                transition: "all 160ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.45)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.65"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.2)"; }}
            >
              + Add decision
            </button>
            <button
              onClick={handleSaveToVault}
              disabled={vaultSaving || allCommitted.length === 0}
              title={allCommitted.length === 0 ? "No committed decisions to save" : "Save a snapshot of this ledger"}
              style={{
                width: "100%", padding: "7px", borderRadius: 6,
                background: vaultSaved ? "rgba(201,162,76,0.1)" : "transparent",
                border: `1px solid ${vaultSaved ? "rgba(201,162,76,0.4)" : "rgba(201,162,76,0.15)"}`,
                color: vaultSaved ? "var(--atlas-gold)" : "var(--atlas-muted)", fontSize: 11,
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                cursor: vaultSaving || allCommitted.length === 0 ? "default" : "pointer",
                opacity: allCommitted.length === 0 ? 0.35 : vaultSaved ? 1 : 0.55,
                transition: "all 160ms ease",
              }}
              onMouseEnter={(e) => { if (!vaultSaving && allCommitted.length > 0 && !vaultSaved) { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.35)"; e.currentTarget.style.color = "var(--atlas-gold)"; } }}
              onMouseLeave={(e) => { if (!vaultSaved) { e.currentTarget.style.opacity = allCommitted.length === 0 ? "0.35" : "0.55"; e.currentTarget.style.borderColor = "rgba(201,162,76,0.15)"; e.currentTarget.style.color = "var(--atlas-muted)"; } }}
            >
              {vaultSaved ? "◆ Snapshot saved" : vaultSaving ? "Saving…" : "◆ Save snapshot"}
            </button>
          </div>
        </>
      )}

      {/* ── Snapshots tab ────────────────────────────────────────────────────── */}
      {ledgerTab === "snapshots" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px" }} className="scrollbar-none">
            {snapsLoading && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--atlas-muted)", fontSize: 11, opacity: 0.45, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em" }}>
                Loading…
              </div>
            )}

            {!snapsLoading && snapshots.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 12px" }}>
                <div style={{ fontSize: 22, marginBottom: 12, opacity: 0.2, color: "var(--atlas-gold)" }}>◆</div>
                <p style={{ fontFamily: "var(--app-font-sans)", fontSize: 13, color: "var(--atlas-muted)", marginBottom: 6, opacity: 0.6 }}>
                  No snapshots yet.
                </p>
                <p style={{ fontFamily: "var(--app-font-mono)", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--atlas-muted)", opacity: 0.4, maxWidth: 200, margin: "0 auto", lineHeight: 1.6 }}>
                  SAVE A SNAPSHOT FROM THE ACTIVITY TAB TO BUILD YOUR ARCHIVE
                </p>
              </div>
            )}

            {!snapsLoading && snapshots.map((snap) => {
              const isExpanded = snapsExpandedId === snap.id;
              const isCopied = snapsCopiedId === snap.id;
              const isConfirmDelete = snapsConfirmDeleteId === snap.id;
              const isDeleting = snapsDeletingId === snap.id;

              return (
                <div
                  key={snap.id}
                  style={{
                    background: "var(--atlas-surface)",
                    border: "1px solid var(--atlas-border)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.08em",
                      color: "rgba(var(--atlas-muted-rgb),0.5)",
                    }}>
                      {formatSnapshotDate(snap.createdAt)}
                    </span>
                    <span style={{
                      fontFamily: "var(--app-font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      color: "var(--atlas-gold)", opacity: 0.75,
                    }}>
                      ◆ {snap.entryCount} decision{snap.entryCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <p style={{ fontFamily: "var(--app-font-sans)", fontSize: 12.5, fontWeight: 500, color: "var(--atlas-fg)", margin: 0, lineHeight: 1.35 }}>
                    {snap.title}
                  </p>

                  <div>
                    <p style={{
                      fontFamily: "var(--app-font-sans)", fontSize: 11.5, color: "var(--atlas-muted)",
                      lineHeight: 1.55, margin: 0,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: isExpanded ? undefined : 3,
                      WebkitBoxOrient: "vertical" as const,
                      whiteSpace: isExpanded ? "pre-wrap" : undefined,
                    }}>
                      {snap.content}
                    </p>
                    {snap.content.length > 180 && (
                      <button
                        onClick={() => setSnapsExpandedId(isExpanded ? null : snap.id)}
                        style={{
                          background: "transparent", border: "none", cursor: "pointer", padding: "4px 0 0",
                          fontFamily: "var(--app-font-mono)", fontSize: 9, letterSpacing: "0.08em",
                          color: "rgba(201,162,76,0.55)", textTransform: "uppercase" as const,
                        }}
                      >
                        {isExpanded ? "Collapse ▲" : "Expand ▼"}
                      </button>
                    )}
                  </div>

                  {(snap.tags ?? []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                      {(snap.tags ?? []).map((tag) => (
                        <span key={tag} style={{
                          fontFamily: "var(--app-font-mono)", fontSize: 8.5,
                          border: "1px solid rgba(201,162,76,0.18)",
                          borderRadius: 20, padding: "1px 7px",
                          color: "rgba(201,162,76,0.65)",
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      onClick={() => handleSnapsCopy(snap)}
                      style={{
                        flex: 1, borderRadius: 6, padding: "6px 0",
                        fontFamily: "var(--app-font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
                        textTransform: "uppercase" as const,
                        border: "1px solid rgba(201,162,76,0.3)",
                        background: isCopied ? "rgba(201,162,76,0.12)" : "rgba(201,162,76,0.05)",
                        color: "var(--atlas-gold)", cursor: "pointer",
                      }}
                    >
                      {isCopied ? "Copied ✓" : "Copy"}
                    </button>

                    {isConfirmDelete ? (
                      <>
                        <button
                          onClick={() => handleSnapsDelete(snap.id)}
                          disabled={isDeleting}
                          style={{
                            borderRadius: 6, padding: "6px 10px",
                            fontFamily: "var(--app-font-mono)", fontSize: 9.5, fontWeight: 700,
                            border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)",
                            color: "rgba(239,68,68,0.85)", cursor: "pointer",
                          }}
                        >
                          {isDeleting ? "…" : "Delete"}
                        </button>
                        <button
                          onClick={() => setSnapsConfirmDeleteId(null)}
                          style={{
                            borderRadius: 6, padding: "6px 10px",
                            fontFamily: "var(--app-font-mono)", fontSize: 9.5,
                            border: "1px solid var(--atlas-border)", background: "transparent",
                            color: "var(--atlas-muted)", cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setSnapsConfirmDeleteId(snap.id)}
                        style={{
                          borderRadius: 6, padding: "6px 10px",
                          border: "1px solid var(--atlas-border)", background: "transparent",
                          color: "var(--atlas-muted)", cursor: "pointer",
                          fontFamily: "var(--app-font-mono)", fontSize: 11,
                          transition: "color 140ms, border-color 140ms",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(239,68,68,0.75)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--atlas-muted)"; e.currentTarget.style.borderColor = "var(--atlas-border)"; }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--atlas-border)" }}>
            <button
              onClick={handleSaveToVault}
              disabled={vaultSaving || allCommitted.length === 0}
              title={allCommitted.length === 0 ? "No committed decisions to snapshot" : "Save a snapshot of current committed decisions"}
              style={{
                width: "100%", padding: "7px", borderRadius: 6,
                background: vaultSaved ? "rgba(201,162,76,0.1)" : "transparent",
                border: `1px solid ${vaultSaved ? "rgba(201,162,76,0.4)" : "rgba(201,162,76,0.18)"}`,
                color: vaultSaved ? "var(--atlas-gold)" : "var(--atlas-muted)", fontSize: 11,
                fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                cursor: vaultSaving || allCommitted.length === 0 ? "default" : "pointer",
                opacity: allCommitted.length === 0 ? 0.35 : vaultSaved ? 1 : 0.6,
                transition: "all 160ms ease",
              }}
            >
              {vaultSaved ? "◆ Snapshot saved" : vaultSaving ? "Saving…" : "◆ Save snapshot now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
