/**
 * History | Checkpoints | Bookmarks bottom sheet.
 *
 * Surfaced from the composer's More menu → "History" item.
 *
 * History tab operates on the localStorage `AtlasHistoryItem` ledger (session-ephemeral).
 * Bookmarks tab reads from the server-backed `project_bookmarks` table — survives
 * browser clears, new devices, and incognito sessions. Falls back to local bookmarks
 * if the server has none yet.
 * Checkpoints tab reads from the server-backed `project_checkpoints` table —
 * richer verified restore points created automatically at meaningful milestones
 * or manually by the user.
 */
import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  Code2,
  CornerUpLeft,
  Gavel,
  History as HistoryIcon,
  Loader2,
  MoreHorizontal,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import {
  type AtlasHistoryItem,
  type AtlasLens,
  type CheckpointType,
  type ProjectCheckpoint,
  type ServerBookmark,
  formatSnapshotTimestamp,
  groupByDay,
  useAtlasHistory,
  useCheckpointCreatedListener,
  useCheckpoints,
  useServerBookmarks,
} from "@/lib/atlas-history";
import { toast } from "sonner";
import { useThemeMode } from "@/lib/theme";

const OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 8, 12, 0.72)",
  backdropFilter: "blur(8px)",
  zIndex: 10000,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  animation: "atlasHistoryFade 180ms ease",
};

const SHEET: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  minHeight: "55vh",
  maxHeight: "85vh",
  background:
    "linear-gradient(180deg, rgba(20,18,14,0.98) 0%, rgba(14,12,10,0.98) 100%)",
  border: "1px solid rgba(196,160,80,0.28)",
  borderBottom: "none",
  borderRadius: "20px 20px 0 0",
  boxShadow:
    "0 -24px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(196,160,80,0.08) inset",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  color: "rgba(244,236,220,0.92)",
};

const TAB_BAR: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: 6,
  margin: "10px 16px 0",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(196,160,80,0.14)",
  borderRadius: 12,
};

const lensGlyph = (lens: AtlasLens) => {
  if (lens === "builder") return <Code2 size={13} strokeWidth={1.7} />;
  if (lens === "strategic") return <Gavel size={13} strokeWidth={1.7} />;
  return <Sparkles size={13} strokeWidth={1.7} />;
};

const CHECKPOINT_ICON: Record<CheckpointType, string> = {
  understanding: "🧠",
  build: "🏗",
  design: "🎨",
  release: "🚀",
  manual: "⭐",
};

const CHECKPOINT_COLOR: Record<CheckpointType, string> = {
  understanding: "rgba(140,200,160,0.85)",
  build: "rgba(120,180,240,0.85)",
  design: "rgba(200,140,220,0.85)",
  release: "rgba(228,196,128,0.95)",
  manual: "rgba(228,196,128,0.75)",
};

const CHECKPOINT_BG: Record<CheckpointType, string> = {
  understanding: "rgba(60,140,80,0.14)",
  build: "rgba(40,100,180,0.14)",
  design: "rgba(120,60,160,0.14)",
  release: "rgba(196,160,80,0.14)",
  manual: "rgba(196,160,80,0.10)",
};

function serverToHistoryItem(sb: ServerBookmark): AtlasHistoryItem {
  let payload: AtlasHistoryItem["payload"] = {};
  if (sb.payload_json) {
    try { payload = JSON.parse(sb.payload_json) as AtlasHistoryItem["payload"]; } catch { /* ignore */ }
  }
  return {
    id: sb.local_id ?? `srv_${sb.id}`,
    associated_message_id: sb.message_id ?? 0,
    title: sb.title,
    timestamp: sb.created_at,
    isBookmarked: true,
    lens: (sb.lens as AtlasLens | null) ?? "builder",
    payload,
  };
}

export function HistoryBookmarksSheet({
  projectId,
  open,
  onClose,
  onJumpToMessage,
}: {
  projectId: number | null;
  open: boolean;
  onClose: () => void;
  onJumpToMessage?: (messageId: number) => void;
}) {
  const [tab, setTab] = useState<"history" | "checkpoints" | "bookmarks">(
    "history",
  );
  const [revertedOpen, setRevertedOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Manual checkpoint creation state
  const [creatingCheckpoint, setCreatingCheckpoint] = useState(false);
  const [checkpointTitle, setCheckpointTitle] = useState("");
  const [checkpointSaving, setCheckpointSaving] = useState(false);

  const { active, reverted, bookmarks, rollback, toggleBookmark, remove } =
    useAtlasHistory(projectId ?? 0);

  const { serverBookmarks } = useServerBookmarks(projectId);

  const { checkpoints, isLoading: checkpointsLoading, refresh: refreshCheckpoints, createManual } =
    useCheckpoints(projectId);

  // Inspect panel state — which checkpoint is expanded
  const [inspectedCheckpoint, setInspectedCheckpoint] = useState<ProjectCheckpoint | null>(null);

  // Toast whenever a new checkpoint is auto-created (fires even when sheet is closed)
  useCheckpointCreatedListener((cp) => {
    const icon = CHECKPOINT_ICON[cp.type] ?? "⭐";
    toast.success(`${icon} Checkpoint saved`, {
      description: cp.title,
      duration: 4500,
    });
    refreshCheckpoints();
  });

  const grouped = useMemo(() => groupByDay(active), [active]);
  const bookmarkSorted = useMemo(() => {
    if (serverBookmarks.length > 0) {
      return serverBookmarks.map(serverToHistoryItem).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    }
    return [...bookmarks].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [serverBookmarks, bookmarks]);

  const isParchment = useThemeMode() === "parchment";

  // Light-mode color palette for sheet surfaces
  const fgPrimary   = isParchment ? "#1F2430"              : "rgba(244,236,220,0.94)";
  const fgMuted     = isParchment ? "#68707C"              : "rgba(244,236,220,0.45)";
  const fgDim       = isParchment ? "#9AA1AA"              : "rgba(244,236,220,0.38)";
  const fgSub       = isParchment ? "rgba(31,36,48,0.55)"  : "rgba(244,236,220,0.42)";
  const rowBg       = isParchment ? "rgba(59, 82, 115,0.05)" : "rgba(255,255,255,0.02)";
  const rowBgHover  = isParchment ? "rgba(59, 82, 115,0.10)" : "rgba(196,160,80,0.07)";
  const rowBorder   = isParchment ? "rgba(59, 82, 115,0.15)" : "rgba(196,160,80,0.08)";
  const rowBorderHover = isParchment ? "rgba(59, 82, 115,0.28)" : "rgba(196,160,80,0.22)";
  const iconBg      = isParchment ? "rgba(59, 82, 115,0.10)" : "rgba(196,160,80,0.10)";
  const iconColor   = isParchment ? "rgba(59, 82, 115,0.85)" : "rgba(228,196,128,0.85)";
  const menuBg      = isParchment ? "#FFFFFF"              : "rgba(20,18,14,0.98)";
  const menuBorder  = isParchment ? "rgba(59, 82, 115,0.22)" : "rgba(196,160,80,0.28)";
  const autoTagBg   = isParchment ? "rgba(59, 82, 115,0.08)" : "rgba(255,255,255,0.05)";
  const autoTagColor= isParchment ? "rgba(31,36,48,0.45)"  : "rgba(244,236,220,0.32)";

  if (!open) return null;

  const handleRollback = (id: string, messageId: number) => {
    rollback(id);
    onJumpToMessage?.(messageId);
    onClose();
  };

  const handleSaveCheckpoint = async () => {
    if (!checkpointTitle.trim()) return;
    setCheckpointSaving(true);
    const result = await createManual(checkpointTitle.trim());
    setCheckpointSaving(false);
    if (result) {
      toast.success(`Checkpoint saved — "${result.title}"`);
      setCreatingCheckpoint(false);
      setCheckpointTitle("");
    } else {
      toast.error("Could not save checkpoint — try again.");
    }
  };

  const renderHistoryRow = (
    item: AtlasHistoryItem,
    opts?: { dim?: boolean },
  ) => (
    <div
      key={item.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: rowBg,
        border: `1px solid ${rowBorder}`,
        opacity: opts?.dim ? 0.55 : 1,
        cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
      onClick={() => handleRollback(item.id, item.associated_message_id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = rowBgHover;
        e.currentTarget.style.borderColor = rowBorderHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = rowBg;
        e.currentTarget.style.borderColor = rowBorder;
      }}
    >
      <span
        style={{
          flex: "0 0 24px",
          height: 24,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          background: iconBg,
          color: iconColor,
        }}
      >
        {lensGlyph(item.lens)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: fgPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: fgMuted,
            marginTop: 2,
            letterSpacing: "0.02em",
          }}
        >
          {formatSnapshotTimestamp(item.timestamp)}
        </div>
      </div>
      <button
        aria-label="Roll back to this snapshot"
        title="Roll back"
        onClick={(e) => {
          e.stopPropagation();
          handleRollback(item.id, item.associated_message_id);
        }}
        style={iconBtnStyle}
      >
        <CornerUpLeft size={14} strokeWidth={1.7} />
      </button>
      <button
        aria-label={item.isBookmarked ? "Remove bookmark" : "Bookmark"}
        title={item.isBookmarked ? "Bookmarked" : "Bookmark"}
        onClick={(e) => {
          e.stopPropagation();
          toggleBookmark(item.id);
        }}
        style={{
          ...iconBtnStyle,
          color: item.isBookmarked
            ? "rgba(228,196,128,0.95)"
            : isParchment ? "#68707C" : "rgba(244,236,220,0.55)",
        }}
      >
        {item.isBookmarked ? (
          <BookmarkCheck size={14} strokeWidth={1.8} />
        ) : (
          <Bookmark size={14} strokeWidth={1.6} />
        )}
      </button>
      <div style={{ position: "relative" }}>
        <button
          aria-label="More actions"
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(menuFor === item.id ? null : item.id);
          }}
          style={iconBtnStyle}
        >
          <MoreHorizontal size={14} strokeWidth={1.7} />
        </button>
        {menuFor === item.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              right: 0,
              top: 28,
              minWidth: 180,
              background: menuBg,
              border: `1px solid ${menuBorder}`,
              borderRadius: 10,
              padding: 6,
              zIndex: 5,
              boxShadow: isParchment ? "0 14px 36px -10px rgba(0,0,0,0.18)" : "0 14px 36px -10px rgba(0,0,0,0.8)",
            }}
          >
            <MenuRow
              label="View code changes"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("atlas:open-diff", {
                    detail: { snapshotId: item.id },
                  }),
                );
                setMenuFor(null);
              }}
            />
            <MenuRow
              label="Open preview"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("atlas:open-preview", {
                    detail: { snapshotId: item.id },
                  }),
                );
                setMenuFor(null);
              }}
            />
            <MenuRow
              label="Delete from history"
              danger
              onClick={() => {
                remove(item.id);
                setMenuFor(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderCheckpointRow = (cp: ProjectCheckpoint) => {
    const icon = CHECKPOINT_ICON[cp.type] ?? "⭐";
    const color = CHECKPOINT_COLOR[cp.type] ?? "rgba(228,196,128,0.75)";
    const bg = CHECKPOINT_BG[cp.type] ?? "rgba(196,160,80,0.10)";
    return (
      <div
        key={cp.id}
        role="button"
        tabIndex={0}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          background: isParchment ? "rgba(59, 82, 115,0.04)" : "rgba(255,255,255,0.025)",
          border: `1px solid ${bg.replace("0.14", "0.25").replace("0.10", "0.20")}`,
          transition: "background 140ms ease, border-color 140ms ease",
          cursor: "pointer",
        }}
        onClick={() => setInspectedCheckpoint(cp)}
        onKeyDown={(e) => e.key === "Enter" && setInspectedCheckpoint(cp)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = bg;
          e.currentTarget.style.borderColor = color.replace("0.85", "0.4").replace("0.75", "0.35").replace("0.95", "0.45");
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isParchment ? "rgba(59, 82, 115,0.04)" : "rgba(255,255,255,0.025)";
          e.currentTarget.style.borderColor = bg.replace("0.14", "0.25").replace("0.10", "0.20");
        }}
      >
        {/* Type badge */}
        <span
          style={{
            flex: "0 0 32px",
            height: 32,
            display: "grid",
            placeItems: "center",
            borderRadius: 8,
            background: bg,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {icon}
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color,
              marginBottom: 2,
            }}
          >
            {cp.label || cp.type}
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: fgPrimary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cp.title}
          </div>
          {cp.notes && (
            <div
              style={{
                fontSize: 12,
                color: fgMuted,
                marginTop: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cp.notes}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                color: fgDim,
                letterSpacing: "0.02em",
              }}
            >
              {formatSnapshotTimestamp(cp.created_at)}
            </span>
            {cp.created_by === "system" && (
              <span
                style={{
                  fontSize: 10,
                  color: autoTagColor,
                  background: autoTagBg,
                  borderRadius: 4,
                  padding: "1px 5px",
                  letterSpacing: "0.06em",
                }}
              >
                auto
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const overlayStyle: React.CSSProperties = {
    ...OVERLAY,
    background: isParchment ? "rgba(31,36,48,0.38)" : "rgba(8, 8, 12, 0.72)",
    backdropFilter: isParchment ? "blur(4px)" : "blur(8px)",
  };

  const sheetStyle: React.CSSProperties = {
    ...SHEET,
    background: isParchment
      ? "linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)"
      : SHEET.background as string,
    border: isParchment ? "1px solid rgba(59, 82, 115,0.22)" : SHEET.border as string,
    boxShadow: isParchment ? "0 -12px 40px rgba(15, 23, 42,0.12)" : SHEET.boxShadow as string,
    color: isParchment ? "#1F2430" : SHEET.color as string,
  };

  const tabBarStyle: React.CSSProperties = {
    ...TAB_BAR,
    background: isParchment ? "rgba(59, 82, 115,0.06)" : TAB_BAR.background as string,
    border: isParchment ? "1px solid rgba(59, 82, 115,0.18)" : TAB_BAR.border as string,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <style>{`
        @keyframes atlasHistoryFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes atlasHistorySlide {
          from { transform: translateY(20px); opacity: 0.6; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes atlasTabIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .atlas-checkpoint-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(196,160,80,0.28);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          color: rgba(244,236,220,0.92);
          outline: none;
          font-family: inherit;
        }
        .atlas-checkpoint-input::placeholder { color: rgba(244,236,220,0.32); }
        .atlas-checkpoint-input:focus { border-color: rgba(196,160,80,0.55); }
      `}</style>
      <div
        style={{ ...sheetStyle, animation: "atlasHistorySlide 220ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HistoryIcon
              size={15}
              strokeWidth={1.7}
              style={{ color: "rgba(228,196,128,0.85)" }}
            />
            <span
              style={{
                fontSize: 13,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: fgSub,
                fontWeight: 600,
              }}
            >
              Time travel
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={iconBtnStyle}>
            <X size={16} strokeWidth={1.7} />
          </button>
        </div>

        {/* Tabs */}
        <div style={tabBarStyle}>
          <TabButton
            active={tab === "history"}
            onClick={() => setTab("history")}
            label="History"
            count={active.length}
          />
          <TabButton
            active={tab === "checkpoints"}
            onClick={() => setTab("checkpoints")}
            label="Checkpoints"
            count={checkpoints.length}
            accent
          />
          <TabButton
            active={tab === "bookmarks"}
            onClick={() => setTab("bookmarks")}
            label="Bookmarks"
            count={bookmarks.length}
          />
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            key={tab}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "atlasTabIn 150ms ease",
            }}
          >

          {tab === "history" ? (
            grouped.length === 0 ? (
              <EmptyState
                icon={<HistoryIcon size={26} strokeWidth={1.4} />}
                copy="No history snapshots recorded yet."
                sub="Snapshots appear as you converse with Atlas."
              />
            ) : (
              <>
                {grouped.map((g) => (
                  <section key={g.label}>
                    <DayLabel>{g.label}</DayLabel>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {g.items.map((i) => renderHistoryRow(i))}
                    </div>
                  </section>
                ))}
                {reverted.length > 0 && (
                  <section>
                    <button
                      onClick={() => setRevertedOpen((v) => !v)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11.5,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: fgSub,
                        padding: "4px 2px 8px",
                      }}
                    >
                      <span>{revertedOpen ? "▾" : "▸"}</span>
                      Reverted edits ({reverted.length})
                    </button>
                    {revertedOpen && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {reverted.map((i) => renderHistoryRow(i, { dim: true }))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          ) : tab === "checkpoints" ? (
            <>
              {/* Manual checkpoint creation panel */}
              {creatingCheckpoint ? (
                <div
                  style={{
                    background: "rgba(196,160,80,0.06)",
                    border: "1px solid rgba(196,160,80,0.28)",
                    borderRadius: 12,
                    padding: "14px 14px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: isParchment ? "rgba(59, 82, 115,0.65)" : "rgba(244,236,220,0.55)",
                      fontWeight: 600,
                    }}
                  >
                    ⭐ Save checkpoint
                  </div>
                  <input
                    className="atlas-checkpoint-input"
                    placeholder="Name this checkpoint…"
                    value={checkpointTitle}
                    autoFocus
                    onChange={(e) => setCheckpointTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveCheckpoint();
                      if (e.key === "Escape") {
                        setCreatingCheckpoint(false);
                        setCheckpointTitle("");
                      }
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={handleSaveCheckpoint}
                      disabled={!checkpointTitle.trim() || checkpointSaving}
                      style={{
                        flex: 1,
                        padding: "7px 12px",
                        borderRadius: 7,
                        border: "1px solid rgba(196,160,80,0.45)",
                        background: "rgba(196,160,80,0.16)",
                        color:
                          checkpointTitle.trim()
                            ? (isParchment ? "rgba(115,72,14,0.98)" : "rgba(244,224,176,0.98)")
                            : (isParchment ? "#9AA1AA" : "rgba(244,236,220,0.4)"),
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor:
                          checkpointTitle.trim() && !checkpointSaving
                            ? "pointer"
                            : "default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        transition: "background 120ms ease",
                        fontFamily: "inherit",
                      }}
                    >
                      {checkpointSaving ? (
                        <Loader2 size={13} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                      ) : null}
                      {checkpointSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setCreatingCheckpoint(false);
                        setCheckpointTitle("");
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 7,
                        border: isParchment ? "1px solid rgba(59, 82, 115,0.18)" : "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                        color: isParchment ? "#68707C" : "rgba(244,236,220,0.5)",
                        fontSize: 12.5,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingCheckpoint(true)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "1px dashed rgba(196,160,80,0.30)",
                    background: "rgba(196,160,80,0.04)",
                    color: "rgba(228,196,128,0.75)",
                    fontSize: 13,
                    fontWeight: 500,
                    transition: "background 120ms ease, border-color 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(196,160,80,0.09)";
                    e.currentTarget.style.borderColor = "rgba(196,160,80,0.50)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(196,160,80,0.04)";
                    e.currentTarget.style.borderColor = "rgba(196,160,80,0.30)";
                  }}
                >
                  <span style={{ fontSize: 15 }}>⭐</span>
                  Save checkpoint now
                </button>
              )}

              {/* Checkpoint list OR inspect panel */}
              {inspectedCheckpoint ? (
                <CheckpointInspectPanel
                  checkpoint={inspectedCheckpoint}
                  onBack={() => setInspectedCheckpoint(null)}
                />
              ) : checkpointsLoading && checkpoints.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "32px 16px",
                    color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.38)",
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={15} strokeWidth={1.7} style={{ animation: "spin 1s linear infinite" }} />
                  Loading checkpoints…
                </div>
              ) : checkpoints.length === 0 ? (
                <EmptyState
                  icon={<Shield size={26} strokeWidth={1.4} />}
                  copy="No checkpoints yet."
                  sub="Atlas creates checkpoints automatically when your project DNA is confirmed or a verified build passes. You can also save one manually anytime."
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {checkpoints.map((cp) => renderCheckpointRow(cp))}
                </div>
              )}
            </>
          ) : tab === "bookmarks" ? (
            bookmarkSorted.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={26} strokeWidth={1.4} />}
                copy="No bookmarks yet."
                sub="Tap the bookmark icon on any snapshot to pin it here."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bookmarkSorted.map((i) =>
                  renderHistoryRow(i, { dim: !!i.reverted }),
                )}
              </div>
            )
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── tiny atoms ─────────────────────────────────────────────────────── */

const iconBtnStyle: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 6,
  color: "rgba(244,236,220,0.6)",
  transition: "background 120ms ease, color 120ms ease",
};

function TabButton({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  accent?: boolean;
}) {
  const isParchment = useThemeMode() === "parchment";
  const accentColor = accent ? "rgba(140,200,160,0.95)" : (isParchment ? "rgba(115,72,14,0.98)" : "rgba(244,224,176,0.98)");
  const accentBorder = accent ? "rgba(100,180,120,0.50)" : (isParchment ? "rgba(59, 82, 115,0.45)" : "rgba(196,160,80,0.45)");
  const accentBg = accent
    ? "linear-gradient(180deg, rgba(60,160,80,0.18), rgba(60,160,80,0.08))"
    : (isParchment
        ? "linear-gradient(180deg, rgba(59, 82, 115,0.14), rgba(59, 82, 115,0.07))"
        : "linear-gradient(180deg, rgba(196,160,80,0.22), rgba(196,160,80,0.10))");

  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        flex: 1,
        textAlign: "center",
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: active ? accentBg : "transparent",
        color: active
          ? accentColor
          : (isParchment ? "#68707C" : "rgba(244,236,220,0.55)"),
        border: active
          ? `1px solid ${accentBorder}`
          : "1px solid transparent",
        transition: "all 140ms ease",
      }}
    >
      {label}
      <span
        style={{
          marginLeft: 6,
          fontSize: 10.5,
          opacity: 0.7,
          fontFamily: "var(--app-font-mono, ui-monospace)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function DayLabel({ children }: { children: React.ReactNode }) {
  const isParchment = useThemeMode() === "parchment";
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.4)",
        padding: "2px 2px 8px",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const isParchment = useThemeMode() === "parchment";
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 10px",
        borderRadius: 6,
        fontSize: 12.5,
        color: danger
          ? "rgba(232,120,110,0.95)"
          : (isParchment ? "#1F2430" : "rgba(244,236,220,0.88)"),
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = isParchment ? "rgba(59, 82, 115,0.07)" : "rgba(255,255,255,0.05)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {label}
    </button>
  );
}

function CheckpointInspectPanel({
  checkpoint: cp,
  onBack,
}: {
  checkpoint: ProjectCheckpoint;
  onBack: () => void;
}) {
  const isParchment = useThemeMode() === "parchment";
  const icon = CHECKPOINT_ICON[cp.type] ?? "⭐";
  const color = CHECKPOINT_COLOR[cp.type] ?? "rgba(228,196,128,0.75)";
  const bg = CHECKPOINT_BG[cp.type] ?? "rgba(196,160,80,0.10)";

  // Extract DNA snapshot fields
  const dna = cp.dna_snapshot as {
    creative_principles?: unknown;
    experience_intent?: unknown;
    visual_sketches?: unknown;
  } | null;

  const creativePrinciples: string[] = Array.isArray(dna?.creative_principles)
    ? (dna!.creative_principles as string[])
    : typeof dna?.creative_principles === "string" && dna.creative_principles
      ? [dna.creative_principles]
      : [];

  const experienceIntent: Record<string, unknown> =
    dna?.experience_intent && typeof dna.experience_intent === "object" && !Array.isArray(dna.experience_intent)
      ? (dna.experience_intent as Record<string, unknown>)
      : {};

  // Extract AM snapshot fields
  const am = cp.am_snapshot as {
    identity?: { name?: string; description?: string };
    intent?: string;
    pages?: unknown[];
    entities?: unknown[];
  } | null;

  const amName = am?.identity?.name ?? null;
  const amDesc = am?.identity?.description ?? null;
  const amIntent = am?.intent ?? null;
  const amPages = Array.isArray(am?.pages) ? am!.pages.length : null;
  const amEntities = Array.isArray(am?.entities) ? am!.entities.length : null;

  const hasDna = creativePrinciples.length > 0 || Object.keys(experienceIntent).length > 0;
  const hasAm = amName || amIntent || amPages;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, animation: "atlasTabIn 150ms ease" }}>
      {/* Back nav */}
      <button
        onClick={onBack}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          color: isParchment ? "#68707C" : "rgba(244,236,220,0.5)",
          padding: "0 2px 14px",
          letterSpacing: "0.04em",
          transition: "color 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = isParchment ? "#1F2430" : "rgba(244,236,220,0.85)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = isParchment ? "#68707C" : "rgba(244,236,220,0.5)")}
      >
        <ChevronLeft size={13} strokeWidth={2} />
        Back to checkpoints
      </button>

      {/* Header card */}
      <div
        style={{
          background: bg,
          border: `1px solid ${color.replace("0.85", "0.3").replace("0.75", "0.25").replace("0.95", "0.35")}`,
          borderRadius: 14,
          padding: "16px 16px 14px",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span
            style={{
              flex: "0 0 40px",
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              background: "rgba(0,0,0,0.25)",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            {icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color,
                marginBottom: 3,
              }}
            >
              {cp.label || cp.type}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: isParchment ? "#1F2430" : "rgba(244,236,220,0.96)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cp.title}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.45)" }}>
            {formatSnapshotTimestamp(cp.created_at)}
          </span>
          {cp.created_by === "system" ? (
            <span
              style={{
                fontSize: 10.5,
                color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.35)",
                background: isParchment ? "rgba(59, 82, 115,0.07)" : "rgba(255,255,255,0.06)",
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: "0.06em",
              }}
            >
              saved by Atlas
            </span>
          ) : (
            <span
              style={{
                fontSize: 10.5,
                color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.35)",
                background: isParchment ? "rgba(59, 82, 115,0.07)" : "rgba(255,255,255,0.06)",
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: "0.06em",
              }}
            >
              saved by you
            </span>
          )}
        </div>

        {cp.notes && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: isParchment ? "#68707C" : "rgba(244,236,220,0.55)",
              lineHeight: 1.5,
            }}
          >
            {cp.notes}
          </div>
        )}
      </div>

      {/* DNA Snapshot */}
      {hasDna && (
        <InspectSection title="DNA Snapshot">
          {creativePrinciples.length > 0 && (
            <InspectBlock label="Creative principles">
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {creativePrinciples.map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)", lineHeight: 1.45 }}>
                    {String(p)}
                  </li>
                ))}
              </ul>
            </InspectBlock>
          )}
          {Object.keys(experienceIntent).length > 0 && (
            <InspectBlock label="Experience intent">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {Object.entries(experienceIntent).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "capitalize",
                        letterSpacing: "0.06em",
                        color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)",
                        paddingTop: 1,
                        minWidth: 72,
                      }}
                    >
                      {k.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)", lineHeight: 1.45 }}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                    </span>
                  </div>
                ))}
              </div>
            </InspectBlock>
          )}
        </InspectSection>
      )}

      {/* Application Model Snapshot */}
      {hasAm && (
        <InspectSection title="Application Model">
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {amName && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: "0 0 72px", fontSize: 11, fontWeight: 600, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)", letterSpacing: "0.06em", paddingTop: 1 }}>
                  Name
                </span>
                <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)" }}>{amName}</span>
              </div>
            )}
            {amIntent && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: "0 0 72px", fontSize: 11, fontWeight: 600, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)", letterSpacing: "0.06em", paddingTop: 1 }}>
                  Intent
                </span>
                <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)", lineHeight: 1.45 }}>{amIntent}</span>
              </div>
            )}
            {amDesc && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: "0 0 72px", fontSize: 11, fontWeight: 600, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)", letterSpacing: "0.06em", paddingTop: 1 }}>
                  About
                </span>
                <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)", lineHeight: 1.45 }}>{amDesc}</span>
              </div>
            )}
            {amPages !== null && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: "0 0 72px", fontSize: 11, fontWeight: 600, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)", letterSpacing: "0.06em", paddingTop: 1 }}>
                  Pages
                </span>
                <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)" }}>
                  {amPages} defined
                </span>
              </div>
            )}
            {amEntities !== null && amEntities > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ flex: "0 0 72px", fontSize: 11, fontWeight: 600, color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.42)", letterSpacing: "0.06em", paddingTop: 1 }}>
                  Entities
                </span>
                <span style={{ fontSize: 12.5, color: isParchment ? "#1F2430" : "rgba(244,236,220,0.78)" }}>
                  {amEntities} defined
                </span>
              </div>
            )}
          </div>
        </InspectSection>
      )}

      {!hasDna && !hasAm && (
        <div
          style={{
            fontSize: 12,
            color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.38)",
            padding: "12px 2px",
            lineHeight: 1.5,
          }}
        >
          No DNA or model snapshot was captured at this point. Snapshots become richer as the project matures.
        </div>
      )}
    </div>
  );
}

function InspectSection({ title, children }: { title: string; children: React.ReactNode }) {
  const isParchment = useThemeMode() === "parchment";
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.35)",
          padding: "0 2px 8px",
          borderBottom: isParchment ? "1px solid rgba(59, 82, 115,0.18)" : "1px solid rgba(244,236,220,0.07)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function InspectBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const isParchment = useThemeMode() === "parchment";
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: isParchment ? "#68707C" : "rgba(244,236,220,0.48)",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  copy,
  sub,
}: {
  icon: React.ReactNode;
  copy: string;
  sub?: string;
}) {
  const isParchment = useThemeMode() === "parchment";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "48px 16px",
        color: isParchment ? "#68707C" : "rgba(244,236,220,0.55)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: "rgba(196,160,80,0.08)",
          border: "1px solid rgba(196,160,80,0.18)",
          color: isParchment ? "rgba(115,72,14,0.7)" : "rgba(228,196,128,0.7)",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{copy}</div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color: isParchment ? "#9AA1AA" : "rgba(244,236,220,0.4)",
            maxWidth: 280,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
