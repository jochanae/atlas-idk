import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEntryReferrer } from "@/hooks/useEntryReferrer";
import type React from "react";
import { useLocation } from "wouter";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { ParkingLotDetailPanel } from "../components/ParkingLotDetailPanel";
import {
  useListProjects,
  useListEntries,
  useUpdateEntry,
  useDeleteEntry,
  useCreateEntry,
  getListEntriesQueryKey,
} from "@workspace/api-client-react";
import type { Entry, Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { CaptureBar } from "@/components/CaptureBar";
import {
  buildParkedEntryPayload,
  buildClarifyPrefill,
  buildResumePrefill,
  PROMOTE_DESTINATIONS,
  PARK_FILTER_CHIPS,
  resolveParkCategory,
  type ParkCategory,
  type PromoteDestination,
} from "@/lib/parking";

// ── Architectural note (locked rule from original Joy) ──────────────────────
// "Ledger and Parking Lot are the same object, rendered differently based on
//  state. Moving between them is NOT duplication. It is a status change on
//  the same object."
// Resume = navigate back to the source project workspace (not a status change).
// Clarify = questioning loop prefill (distinct from Resume).
// Promote = graduation — ask "Promote to what?" and persist the type.
// Commit = status flip from 'parked' → 'committed' on the same row.

type AllProjectGroup = { project: Project; entries: Entry[] };

export default function ParkingLot() {
  const [, setLocation] = useLocation();
  const { goBack } = useEntryReferrer();

  const queryClient = useQueryClient();
  const ptrContainerRef = useRef<HTMLDivElement>(null);
  const {
    pulling: ptr_pulling,
    distance: ptr_distance,
    refreshing: ptr_refreshing,
  } = usePullToRefresh(
    async () => {
      await queryClient.invalidateQueries();
    },
    true,
    ptrContainerRef,
  );

  const { data: projects = [] } = useListProjects();

  // null = "All Projects" (default); a number = specific project
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("project");
      return p ? parseInt(p, 10) : null;
    } catch { return null; }
  });

  const [busyId, setBusyId] = useState<number | null>(null);
  const [detailEntry, setDetailEntry] = useState<Entry | null>(null);
  const [noteOpenId, setNoteOpenId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [allProjectsData, setAllProjectsData] = useState<AllProjectGroup[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ParkCategory | "all">("all");

  // Single-project mode — queries disabled when showing All Projects
  const queryProjectId = selectedProjectId ?? 0;
  const enabled = selectedProjectId !== null;

  const { data: parkedEntries = [], isLoading: loadingParked } = useListEntries(
    queryProjectId,
    { status: "parked" },
    { query: { queryKey: ["entries", queryProjectId, "parked"], enabled } }
  );
  const { data: draftEntries = [], isLoading: loadingDraft } = useListEntries(
    queryProjectId,
    { status: "draft" },
    { query: { queryKey: ["entries", queryProjectId, "draft"], enabled } }
  );
  const { data: committedEntries = [], isLoading: loadingCommitted } = useListEntries(
    queryProjectId,
    { status: "committed" },
    { query: { queryKey: ["entries", queryProjectId, "committed"], enabled } }
  );
  const isSingleLoading = loadingParked || loadingDraft || loadingCommitted;

  const singleEntries: Entry[] = [...parkedEntries, ...draftEntries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((e) => categoryFilter === "all" || resolveParkCategory(e) === categoryFilter);
  const activeDetailEntry = detailEntry ? singleEntries.find(e => e.id === detailEntry.id) ?? detailEntry : null;

  const filterEntries = useCallback(
    (entries: Entry[]) =>
      categoryFilter === "all"
        ? entries
        : entries.filter((e) => resolveParkCategory(e) === categoryFilter),
    [categoryFilter],
  );

  // All-projects fetch
  useEffect(() => {
    if (selectedProjectId !== null || projects.length === 0) {
      setAllProjectsData([]);
      return;
    }
    setLoadingAll(true);
    const BASE_URL = ((import.meta.env.BASE_URL as string) || "").replace(/\/$/, "");
    Promise.all(
      projects.map(async (p) => {
        const [pr, dr] = await Promise.all([
          fetch(`${BASE_URL}/api/projects/${p.id}/entries?status=parked`, { credentials: "include" }),
          fetch(`${BASE_URL}/api/projects/${p.id}/entries?status=draft`, { credentials: "include" }),
        ]);
        const parked: Entry[] = pr.ok ? await pr.json() : [];
        const draft: Entry[] = dr.ok ? await dr.json() : [];
        const entries = [...parked, ...draft].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return { project: p as Project, entries };
      })
    )
      .then(groups => setAllProjectsData(groups.filter(g => g.entries.length > 0)))
      .catch(() => {})
      .finally(() => setLoadingAll(false));
  }, [selectedProjectId, projects]);

  const totalCount = selectedProjectId === null
    ? allProjectsData.reduce((s, g) => s + g.entries.length, 0)
    : singleEntries.length;

  const invalidateAll = () => {
    projects.forEach(p => {
      queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey(p.id) });
      queryClient.invalidateQueries({ queryKey: ["entries", p.id, "parked"] });
      queryClient.invalidateQueries({ queryKey: ["entries", p.id, "draft"] });
      queryClient.invalidateQueries({ queryKey: ["entries", p.id, "committed"] });
    });
    queryClient.invalidateQueries({ queryKey: ["entries", queryProjectId, "parked"] });
    queryClient.invalidateQueries({ queryKey: ["entries", queryProjectId, "draft"] });
    queryClient.invalidateQueries({ queryKey: ["entries", queryProjectId, "committed"] });
  };

  const updateEntry = useUpdateEntry({ mutation: { onSuccess: invalidateAll } });
  const deleteEntry = useDeleteEntry({ mutation: { onSuccess: invalidateAll } });
  const createEntry = useCreateEntry({ mutation: { onSuccess: invalidateAll } });

  const handleCapture = (content: string, intent?: string) => {
    const target = selectedProjectId ?? projects[0]?.id;
    if (!target) return;
    createEntry.mutate({
      projectId: target,
      data: buildParkedEntryPayload(content, null, null, null, null, intent),
    });
  };

  const handleResume = (entry: Entry) => {
    if (entry.projectId) {
      try {
        sessionStorage.setItem(
          `atlas-resume-fill-${entry.projectId}`,
          buildResumePrefill(entry.title, entry.contextWhat),
        );
      } catch {}
      setLocation(`/project/${entry.projectId}`);
    } else {
      setLocation("/home");
    }
  };

  const handleClarify = (entry: Entry) => {
    if (entry.projectId) {
      try {
        sessionStorage.setItem(
          `atlas-resume-fill-${entry.projectId}`,
          buildClarifyPrefill(entry.title, entry.contextWhat),
        );
      } catch {}
      setLocation(`/project/${entry.projectId}`);
    } else {
      setLocation("/home");
    }
  };

  const handlePromote = (entry: Entry, toType: PromoteDestination) => {
    setBusyId(entry.id);
    void fetch(`/api/entries/${entry.id}/promote`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toType }),
    })
      .then((res) => {
        if (res.ok) invalidateAll();
      })
      .finally(() => setBusyId(null));
  };

  const handleDelete = (entry: Entry) => {
    setBusyId(entry.id);
    deleteEntry.mutate({ id: entry.id }, { onSettled: () => setBusyId(null) });
  };

  const handleNoteBlur = async (entry: Entry) => {
    const noteText = noteDrafts[entry.id] ?? "";
    setNoteOpenId(null);
    await updateEntry.mutateAsync({ id: entry.id, data: { details: noteText.trim() || null } }).catch(() => {});
  };

  const handlePanelCommit = async (entry: Entry) => {
    setBusyId(entry.id);
    try {
      await updateEntry.mutateAsync({ id: entry.id, data: { status: "committed", severity: "committed" } });
      setDetailEntry(null);
    } finally {
      setBusyId(null);
    }
  };

  const handlePanelDelete = async (entry: Entry) => {
    setBusyId(entry.id);
    try {
      await deleteEntry.mutateAsync({ id: entry.id });
      setDetailEntry(null);
    } finally {
      setBusyId(null);
    }
  };

  const rowProps = (entry: Entry) => ({
    entry,
    busy: busyId === entry.id,
    noteOpen: noteOpenId === entry.id,
    noteValue: noteDrafts[entry.id] ?? entry.details ?? "",
    onOpen: () => setDetailEntry(entry),
    onResume: () => handleResume(entry),
    onClarify: () => handleClarify(entry),
    onPromote: (toType: PromoteDestination) => handlePromote(entry, toType),
    onDelete: () => handleDelete(entry),
    onNoteOpen: () => {
      setNoteDrafts(prev => ({ ...prev, [entry.id]: prev[entry.id] ?? entry.details ?? "" }));
      setNoteOpenId(entry.id);
    },
    onNoteChange: (value: string) => setNoteDrafts(prev => ({ ...prev, [entry.id]: value })),
    onNoteBlur: () => void handleNoteBlur(entry),
  });

  const captureTarget = selectedProjectId ?? projects[0]?.id ?? null;

  return (
    <div
      ref={ptrContainerRef}
      style={{
        height: "100dvh",
        overflowY: "auto",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {(ptr_pulling || ptr_refreshing) && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, zIndex: 100,
            display: "flex", justifyContent: "center", alignItems: "flex-end",
            height: Math.min(ptr_distance, 72) + 16,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 26, height: 26, borderRadius: "50%",
              border: "1.5px solid rgba(201,162,76,0.25)",
              borderTopColor: ptr_distance >= 96 || ptr_refreshing ? "var(--atlas-gold)" : "rgba(201,162,76,0.5)",
              opacity: Math.min(ptr_distance / 60, 1),
              animation: ptr_refreshing ? "ptr-spin 700ms linear infinite" : "none",
              transform: ptr_refreshing ? "none" : `rotate(${Math.min((ptr_distance / 96) * 270, 270)}deg)`,
            }}
          />
        </div>
      )}
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--atlas-surface)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--atlas-border)",
        padding: "0 20px",
        height: 50, display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          type="button"
          onClick={() => goBack()}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "4px 0", color: "var(--atlas-muted)", flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, overflow: "hidden" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-muted)", opacity: 0.5, letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 }}>atlas</span>
          <span style={{ color: "var(--atlas-border)", fontSize: 11, flexShrink: 0 }}>/</span>
          <span style={{ fontSize: 10, fontFamily: "var(--app-font-mono)", color: "var(--atlas-gold)", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Parking Lot</span>
          {totalCount > 0 && (
            <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: "rgba(201,162,76,0.1)", border: "1px solid rgba(201,162,76,0.25)", color: "rgba(201,162,76,0.75)", padding: "1px 8px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" }}>
              {totalCount}
            </span>
          )}
        </div>

        {/* Project filter */}
        {projects.length > 0 && (
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedProjectId(v === "" ? null : Number(v));
            }}
            style={{
              background: "var(--atlas-surface)", border: "1px solid var(--atlas-gold-border)",
              color: "var(--atlas-fg)", borderRadius: 6, padding: "4px 8px",
              fontSize: 11, fontFamily: "var(--app-font-mono)", cursor: "pointer", outline: "none", flexShrink: 0,
              maxWidth: 120, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
            }}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "32px 20px 120px" }}>
        <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>

          {/* Page title */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 300, color: "var(--atlas-fg)", letterSpacing: "-0.02em" }}>
              {selectedProjectId === null ? "All Parked Ideas" : "Parking Lot"}
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--atlas-muted)", opacity: 0.55, fontStyle: "italic", fontFamily: "var(--app-font-sans)" }}>
              {totalCount > 0
                ? `${totalCount} item${totalCount === 1 ? "" : "s"} waiting — Resume, Clarify, Promote, or Delete.`
                : "A decision queue for unfinished thinking — not an inbox."}
            </p>
          </div>

          {/* Capture bar */}
          {captureTarget && (
            <div style={{ marginBottom: 20 }}>
              <CaptureBar
                context="modal"
                destinations={["park"]}
                defaultDestination="park"
                projectId={String(captureTarget)}
                onPark={handleCapture}
              />
            </div>
          )}

          {/* Category filters — persist on park via verb; chips filter the list */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            {PARK_FILTER_CHIPS.map((chip) => {
              const active = categoryFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setCategoryFilter(chip.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "rgba(201,162,76,0.55)" : "rgba(201,162,76,0.14)"}`,
                    background: active ? "rgba(201,162,76,0.14)" : "transparent",
                    color: active ? "var(--atlas-gold)" : "rgba(var(--atlas-muted-rgb), 0.7)",
                    fontFamily: "var(--app-font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {selectedProjectId === null ? (
            loadingAll ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                <LoadingSpinner size="md" color="atlas" />
              </div>
            ) : allProjectsData.length === 0 ? (
              <EmptyParked />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {allProjectsData.map(({ project, entries: groupEntries }) => {
                  const filtered = filterEntries(groupEntries);
                  if (filtered.length === 0) return null;
                  return (
                  <div key={project.id}>
                    {/* Project group header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--atlas-fg)", letterSpacing: "-0.01em" }}>{project.name}</span>
                      <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", background: "rgba(201,162,76,0.08)", border: "1px solid rgba(201,162,76,0.2)", color: "rgba(201,162,76,0.65)", padding: "1px 7px", borderRadius: 20 }}>
                        {filtered.length} {filtered.length === 1 ? "item" : "items"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em", color: "rgba(var(--atlas-muted-rgb),0.5)", background: "transparent", border: "none", cursor: "pointer", padding: 0, textTransform: "uppercase" }}
                      >
                        Filter →
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {filtered.map(entry => (
                        <ParkingLotRow key={entry.id} {...rowProps(entry)} />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            )
          ) : !captureTarget ? (
            <EmptyState message="No projects yet. Start one from home." />
          ) : isSingleLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
              <LoadingSpinner size="md" color="atlas" />
            </div>
          ) : singleEntries.length === 0 ? (
            <EmptyParked />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {singleEntries.map(entry => (
                <ParkingLotRow key={entry.id} {...rowProps(entry)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer audit line */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        height: 2,
        background: totalCount > 0 ? "rgba(201,162,76,0.45)" : "rgba(120,113,108,0.2)",
        zIndex: 50,
        transition: "background 600ms ease",
      }} />

      {activeDetailEntry && selectedProjectId !== null && (
        <ParkingLotDetailPanel
          entry={activeDetailEntry}
          projectId={selectedProjectId}
          onClose={() => setDetailEntry(null)}
          onCommit={() => void handlePanelCommit(activeDetailEntry)}
          onDelete={() => void handlePanelDelete(activeDetailEntry)}
        />
      )}
    </div>
  );
}

function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function ParkingLotRow({
  entry,
  busy,
  noteOpen,
  noteValue,
  onOpen,
  onResume,
  onClarify,
  onPromote,
  onDelete,
  onNoteOpen,
  onNoteChange,
  onNoteBlur,
}: {
  entry: Entry;
  busy: boolean;
  noteOpen: boolean;
  noteValue: string;
  onOpen: () => void;
  onResume: () => void;
  onClarify: () => void;
  onPromote: (toType: PromoteDestination) => void;
  onDelete: () => void;
  onNoteOpen: () => void;
  onNoteChange: (value: string) => void;
  onNoteBlur: () => void;
}) {
  const [showPromoteMenu, setShowPromoteMenu] = useState(false);
  const [menuRect, setMenuRect] = useState<{ bottom: number; right: number } | null>(null);
  const promoteAnchorRef = useRef<HTMLDivElement>(null);
  const category = resolveParkCategory(entry);
  const entryTypeBadge = category.toUpperCase();
  const summary = entry.summary || entry.title;

  const openPromoteMenu = useCallback(() => {
    if (promoteAnchorRef.current) {
      const r = promoteAnchorRef.current.getBoundingClientRect();
      setMenuRect({ bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right });
    }
    setShowPromoteMenu(true);
  }, []);

  return (
    <article
      onClick={onOpen}
      style={{
        borderRadius: 8, padding: "0.5px",
        background: "linear-gradient(135deg, color-mix(in oklab, var(--atlas-gold) 24%, transparent), color-mix(in oklab, var(--atlas-border) 70%, transparent), transparent)",
        boxShadow: "0 8px 24px -18px var(--atlas-gold)",
        cursor: "pointer",
      }}
    >
      <div style={{ borderRadius: 7.5, background: "var(--atlas-surface)" }}>
        <div style={{ padding: "13px 14px 10px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span
            style={{
              marginTop: 5, width: 8, height: 8, borderRadius: "50%",
              background: entry.severity === "blocker" ? "var(--atlas-ember)" : "var(--atlas-gold)",
              flexShrink: 0, boxShadow: "0 0 0 3px color-mix(in oklab, currentColor 12%, transparent)",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h3 style={{ margin: 0, flex: 1, color: "var(--atlas-fg)", fontSize: 13.5, lineHeight: 1.35, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.title}
              </h3>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNoteOpen(); }}
                style={{
                  padding: "2px 7px", borderRadius: 4,
                  border: "1px solid var(--atlas-border)",
                  background: entry.details ? "color-mix(in oklab, var(--atlas-gold) 10%, transparent)" : "transparent",
                  color: entry.details ? "var(--atlas-gold)" : "var(--atlas-muted)",
                  cursor: "pointer", fontFamily: "var(--app-font-mono)", fontSize: 8.5, letterSpacing: "0.12em",
                }}
              >
                {entryTypeBadge}
              </button>
            </div>
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--atlas-muted)", opacity: 0.55, textTransform: "uppercase", marginBottom: 7 }}>
              {entry.contextWhat ? `From: ${entry.contextWhat}` : "Parked"} · {timeAgo(entry.createdAt)}
            </div>
            <p style={{ margin: 0, color: "var(--atlas-muted)", fontSize: 12, lineHeight: 1.55 }}>
              {summary}
            </p>
          </div>
        </div>

        {noteOpen && (
          <div onClick={(e) => e.stopPropagation()} style={{ padding: "0 14px 12px 32px" }}>
            <input
              autoFocus
              value={noteValue}
              onChange={(e) => onNoteChange(e.target.value)}
              onBlur={onNoteBlur}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              placeholder="Add a short note..."
              style={{
                width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7,
                background: "var(--atlas-bg)", border: "1px solid var(--atlas-border)",
                color: "var(--atlas-fg)", outline: "none", fontSize: 12, fontFamily: "var(--app-font-sans)",
              }}
            />
          </div>
        )}

        <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--atlas-border), transparent)" }} />

        <footer onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, padding: "8px 14px", flexWrap: "wrap" }}>
          <ParkingLotButton disabled={busy} onClick={onResume}>Resume</ParkingLotButton>
          <ParkingLotButton disabled={busy} onClick={onClarify}>Clarify</ParkingLotButton>

          {/* Promote… — ask "Promote to what?" and persist chosen type */}
          <div ref={promoteAnchorRef}>
            <ParkingLotButton disabled={busy} tone="gold" onClick={() => showPromoteMenu ? setShowPromoteMenu(false) : openPromoteMenu()}>
              Promote…
            </ParkingLotButton>
          </div>
          {showPromoteMenu && menuRect && typeof document !== "undefined" && createPortal(
            <>
              <div
                onClick={() => setShowPromoteMenu(false)}
                style={{ position: "fixed", inset: 0, zIndex: 9998 }}
              />
              <div style={{
                position: "fixed",
                bottom: menuRect.bottom,
                right: menuRect.right,
                background: "var(--atlas-bg)",
                border: "1px solid color-mix(in oklab, var(--atlas-gold) 28%, transparent)",
                borderRadius: 8, padding: 4, zIndex: 9999,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                minWidth: 150,
              }}>
                <div style={{
                  padding: "6px 14px 4px",
                  fontSize: 9,
                  fontFamily: "var(--app-font-mono)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(var(--atlas-muted-rgb),0.55)",
                }}>
                  Promote to what?
                </div>
                {PROMOTE_DESTINATIONS.map(pt => (
                  <button
                    key={pt.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPromoteMenu(false);
                      onPromote(pt.value);
                    }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "8px 14px", background: "transparent", border: "none",
                      color: "var(--atlas-fg)", fontSize: 9.5,
                      fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
                      cursor: "pointer", borderRadius: 5, textTransform: "uppercase",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,162,76,0.1)"; e.currentTarget.style.color = "var(--atlas-gold)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--atlas-fg)"; }}
                  >
                    → {pt.label}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}

          <ParkingLotButton disabled={busy} onClick={onDelete} tone="danger">Delete</ParkingLotButton>
        </footer>
      </div>
    </article>
  );
}

function ParkingLotButton({
  children,
  onClick,
  disabled,
  tone = "muted",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "danger" | "gold";
}) {
  const color = tone === "gold"
    ? "var(--atlas-gold)"
    : tone === "danger" ? "var(--atlas-ember)" : "var(--atlas-muted)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "5px 10px", borderRadius: 5,
        background: tone === "gold" ? "rgba(201,162,76,0.1)" : "transparent",
        border: `1px solid ${tone === "gold" ? "rgba(201,162,76,0.3)" : tone === "danger" ? "rgba(239,68,68,0.25)" : "var(--atlas-border)"}`,
        color: tone === "gold" ? "var(--atlas-gold)" : color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "var(--app-font-mono)",
        fontSize: 9.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyParked() {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        border: "1px solid var(--atlas-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px",
        background: "rgba(201,162,76,0.04)",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(201,162,76,0.5)" }} />
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--atlas-fg)", opacity: 0.5 }}>
        No unresolved thinking here.
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--atlas-muted)", fontFamily: "var(--app-font-sans)", opacity: 0.55, maxWidth: 320, marginInline: "auto", lineHeight: 1.5 }}>
        The Parking Lot is a decision queue — only intentionally deferred work belongs here. Park from chat, or when Joy asks.
      </p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: "48px 24px", textAlign: "center",
      color: "var(--atlas-muted)", fontSize: 13, fontStyle: "italic",
      opacity: 0.5, fontFamily: "var(--app-font-sans)",
    }}>
      {message}
    </div>
  );
}
