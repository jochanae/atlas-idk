import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

export interface QueueItem {
  id: string;
  text: string;
  status: "pending" | "running" | "done" | "failed";
  /** Dependency graph IDs carried from plan promotion */
  planStepId?: string;
  dependsOn?: string[];
}

interface TaskQueueProps {
  items: QueueItem[];
  onReorder: (items: QueueItem[]) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExecuteAll: () => void;
  onExecuteOne: (id: string) => void;
  executing: boolean;
}

export function TaskQueue({
  items,
  onReorder,
  onEdit,
  onRemove,
  onDuplicate,
  onExecuteAll,
  onExecuteOne,
  executing,
}: TaskQueueProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const pending = items.filter((i) => i.status === "pending");

  const startEdit = (item: QueueItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) {
      onEdit(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  const handleDragStart = (id: string) => {
    dragIdRef.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current && dragIdRef.current !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = useCallback(
    (targetId: string) => {
      const fromId = dragIdRef.current;
      if (!fromId || fromId === targetId) {
        setDragOverId(null);
        return;
      }
      const fromIdx = items.findIndex((i) => i.id === fromId);
      const toIdx = items.findIndex((i) => i.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...items];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onReorder(next);
      dragIdRef.current = null;
      setDragOverId(null);
    },
    [items, onReorder],
  );

  if (items.length === 0) return null;

  const statusIcon = (s: QueueItem["status"]) => {
    if (s === "done")
      return (
        <svg viewBox="0 0 16 16" width={12} height={12} stroke="var(--phosphor)" fill="none" strokeWidth={2}>
          <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    if (s === "running")
      return (
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            border: "2px solid var(--accent-gold)",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "atlas-spin 700ms linear infinite",
          }}
        />
      );
    if (s === "failed")
      return (
        <svg viewBox="0 0 16 16" width={12} height={12} stroke="var(--ember)" fill="none" strokeWidth={2}>
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      );
    return (
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          border: "1.5px solid var(--muted-text)",
          opacity: 0.5,
        }}
      />
    );
  };

  return (
    <div
      style={{
        background: "color-mix(in oklab, var(--surface) 92%, var(--accent-gold) 8%)",
        border: "1px solid color-mix(in oklab, var(--accent-gold) 15%, var(--border))",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
            opacity: 0.9,
          }}
        >
          Queue · {pending.length} pending
        </span>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={onExecuteAll}
            disabled={executing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: 8,
              border: "none",
              background: "var(--ember)",
              color: "var(--background)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: executing ? "default" : "pointer",
              opacity: executing ? 0.5 : 1,
              boxShadow: "0 0 12px -2px rgba(234,88,12,0.5)",
              transition: "opacity 200ms",
            }}
          >
            <svg viewBox="0 0 16 16" width={10} height={10} fill="currentColor">
              <path d="M4 2l10 6-10 6z" />
            </svg>
            Run all
          </button>
        )}
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, idx) => {
          const isDragOver = dragOverId === item.id;
          return (
            <div
              key={item.id}
              draggable={item.status === "pending"}
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragEnd={() => setDragOverId(null)}
              onDrop={() => handleDrop(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                background: isDragOver
                  ? "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))"
                  : "var(--surface)",
                border: isDragOver
                  ? "1px dashed var(--accent-gold)"
                  : "1px solid color-mix(in oklab, var(--border) 60%, transparent)",
                transition: "background 150ms, border 150ms",
                opacity: item.status === "done" ? 0.5 : 1,
                cursor: item.status === "pending" ? "grab" : "default",
              }}
            >
              {/* Grab handle */}
              {item.status === "pending" && (
                <svg
                  viewBox="0 0 16 16"
                  width={12}
                  height={12}
                  fill="var(--accent-gold)"
                  style={{ opacity: 0.5, flexShrink: 0, cursor: "grab" }}
                >
                  <circle cx="5" cy="4" r="1.2" />
                  <circle cx="5" cy="8" r="1.2" />
                  <circle cx="5" cy="12" r="1.2" />
                  <circle cx="11" cy="4" r="1.2" />
                  <circle cx="11" cy="8" r="1.2" />
                  <circle cx="11" cy="12" r="1.2" />
                </svg>
              )}

              {/* Status */}
              <span style={{ flexShrink: 0 }}>{statusIcon(item.status)}</span>

              {/* Text / edit */}
              {editingId === item.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--foreground)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => item.status === "pending" && startEdit(item)}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: "var(--foreground)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: item.status === "pending" ? "text" : "default",
                  }}
                  title={item.text}
                >
                  {item.text}
                </span>
              )}

              {/* Order badge */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--muted-text)",
                  opacity: 0.5,
                  flexShrink: 0,
                }}
              >
                #{idx + 1}
              </span>

              {/* Actions */}
              {item.status === "pending" && (
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  {/* Execute one */}
                  <button
                    type="button"
                    onClick={() => onExecuteOne(item.id)}
                    disabled={executing}
                    title="Execute"
                    style={iconBtnStyle}
                  >
                    <svg viewBox="0 0 16 16" width={10} height={10} fill="var(--ember)">
                      <path d="M5 3l8 5-8 5z" />
                    </svg>
                  </button>
                  {/* Duplicate */}
                  <button type="button" onClick={() => onDuplicate(item.id)} title="Duplicate" style={iconBtnStyle}>
                    <svg viewBox="0 0 16 16" width={10} height={10} stroke="var(--muted-text)" fill="none" strokeWidth={1.5}>
                      <rect x="2" y="5" width="8" height="8" rx="1.5" />
                      <path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h5A1.5 1.5 0 0 1 14 3.5v5a1.5 1.5 0 0 1-1.5 1.5H11" />
                    </svg>
                  </button>
                  {/* Remove */}
                  <button type="button" onClick={() => onRemove(item.id)} title="Remove" style={iconBtnStyle}>
                    <svg viewBox="0 0 16 16" width={10} height={10} stroke="var(--muted-text)" fill="none" strokeWidth={1.5}>
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes atlas-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  opacity: 0.6,
  transition: "opacity 150ms",
};
