/**
 * History | Checkpoints | Bookmarks bottom sheet.
 *
 * Surfaced from the composer's More menu → "History" item.
 *
 * History & Bookmarks tabs operate on the localStorage `AtlasHistoryItem` ledger.
 * Checkpoints tab reads from the server-backed `project_checkpoints` table —
 * richer verified restore points created automatically at meaningful milestones
 * or manually by the user.
 */
import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
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
  formatSnapshotTimestamp,
  groupByDay,
  useAtlasHistory,
  useCheckpoints,
} from "@/lib/atlas-history";
import { toast } from "sonner";

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

  const { checkpoints, isLoading: checkpointsLoading, refresh: refreshCheckpoints, createManual } =
    useCheckpoints(projectId);

  const grouped = useMemo(() => groupByDay(active), [active]);
  const bookmarkSorted = useMemo(
    () =>
      [...bookmarks].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [bookmarks],
  );

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
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(196,160,80,0.08)",
        opacity: opts?.dim ? 0.55 : 1,
        cursor: "pointer",
        transition: "background 140ms ease, border-color 140ms ease",
      }}
      onClick={() => handleRollback(item.id, item.associated_message_id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(196,160,80,0.07)";
        e.currentTarget.style.borderColor = "rgba(196,160,80,0.22)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        e.currentTarget.style.borderColor = "rgba(196,160,80,0.08)";
      }}
    >
      <span
        style={{
          flex: "0 0 24px",
          height: 24,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          background: "rgba(196,160,80,0.10)",
          color: "rgba(228,196,128,0.85)",
        }}
      >
        {lensGlyph(item.lens)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "rgba(244,236,220,0.94)",
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
            color: "rgba(244,236,220,0.45)",
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
            : "rgba(244,236,220,0.55)",
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
              background: "rgba(20,18,14,0.98)",
              border: "1px solid rgba(196,160,80,0.28)",
              borderRadius: 10,
              padding: 6,
              zIndex: 5,
              boxShadow: "0 14px 36px -10px rgba(0,0,0,0.8)",
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
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.025)",
          border: `1px solid ${bg.replace("0.14", "0.25").replace("0.10", "0.20")}`,
          transition: "background 140ms ease, border-color 140ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = bg;
          e.currentTarget.style.borderColor = color.replace("0.85", "0.4").replace("0.75", "0.35").replace("0.95", "0.45");
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.025)";
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
              color: "rgba(244,236,220,0.94)",
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
                color: "rgba(244,236,220,0.5)",
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
                color: "rgba(244,236,220,0.38)",
                letterSpacing: "0.02em",
              }}
            >
              {formatSnapshotTimestamp(cp.created_at)}
            </span>
            {cp.created_by === "system" && (
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(244,236,220,0.32)",
                  background: "rgba(255,255,255,0.05)",
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

  return (
    <div style={OVERLAY} onClick={onClose}>
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
        style={{ ...SHEET, animation: "atlasHistorySlide 220ms ease" }}
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
                color: "rgba(244,236,220,0.62)",
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
        <div style={TAB_BAR}>
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
                        color: "rgba(244,236,220,0.42)",
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
                      color: "rgba(244,236,220,0.55)",
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
                            ? "rgba(244,224,176,0.98)"
                            : "rgba(244,236,220,0.4)",
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
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                        color: "rgba(244,236,220,0.5)",
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

              {/* Checkpoint list */}
              {checkpointsLoading && checkpoints.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "32px 16px",
                    color: "rgba(244,236,220,0.38)",
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
          ) : bookmarkSorted.length === 0 ? (
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
          )}
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
  count: number;
  accent?: boolean;
}) {
  const accentColor = accent ? "rgba(140,200,160,0.95)" : "rgba(244,224,176,0.98)";
  const accentBorder = accent ? "rgba(100,180,120,0.50)" : "rgba(196,160,80,0.45)";
  const accentBg = accent
    ? "linear-gradient(180deg, rgba(60,160,80,0.18), rgba(60,160,80,0.08))"
    : "linear-gradient(180deg, rgba(196,160,80,0.22), rgba(196,160,80,0.10))";

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
          : "rgba(244,236,220,0.55)",
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
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(244,236,220,0.4)",
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
          : "rgba(244,236,220,0.88)",
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "rgba(255,255,255,0.05)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {label}
    </button>
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
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "48px 16px",
        color: "rgba(244,236,220,0.55)",
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
          color: "rgba(228,196,128,0.7)",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{copy}</div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color: "rgba(244,236,220,0.4)",
            maxWidth: 280,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
