import { useState, useCallback, useRef, useEffect } from "react";

export type QueueItem = {
  id: string;
  text: string;
  status: "pending" | "running" | "done" | "error";
  createdAt: number;
};

type Props = {
  items: QueueItem[];
  onReorder: (items: QueueItem[]) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExecuteAll: () => void;
  onExecuteOne: (id: string) => void;
  executing: boolean;
};

/**
 * TaskQueue — collapsible async queue above the input area.
 * Drag-and-drop reorder, item menus, badge count, batch execute.
 */
export function TaskQueue({
  items,
  onReorder,
  onEdit,
  onRemove,
  onDuplicate,
  onExecuteAll,
  onExecuteOne,
  executing,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const pendingItems = items.filter((i) => i.status === "pending");
  const count = pendingItems.length;

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback(
    (idx: number) => {
      if (dragIdx === null || dragIdx === idx) {
        setDragIdx(null);
        setOverIdx(null);
        return;
      }
      const newItems = [...items];
      const [moved] = newItems.splice(dragIdx, 1);
      newItems.splice(idx, 0, moved);
      onReorder(newItems);
      setDragIdx(null);
      setOverIdx(null);
    },
    [dragIdx, items, onReorder],
  );

  const startEdit = (item: QueueItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setMenuOpen(null);
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) {
      onEdit(editingId, editText.trim());
    }
    setEditingId(null);
    setEditText("");
  };

  if (count === 0 && items.every((i) => i.status !== "running")) return null;

  return (
    <div
      style={{
        borderRadius: 14,
        background: "var(--surface)",
        border: "0.5px solid var(--glass-border)",
        overflow: "hidden",
        transition: "all 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        animation: "atlas-bubble-in 200ms ease forwards",
      }}
    >
      {/* Header bar — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--foreground)",
        }}
      >
        {/* Expand chevron */}
        <svg
          viewBox="0 0 16 16"
          width={10}
          height={10}
          stroke="var(--muted-text)"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
          }}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent-gold)",
          }}
        >
          Queue
        </span>

        {/* Badge */}
        {count > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: "color-mix(in oklab, var(--accent-gold) 15%, transparent)",
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 30%, transparent)",
              color: "var(--accent-gold)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {count}
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* Execute all button */}
        {count > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onExecuteAll();
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: executing
                ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)"
                : "color-mix(in oklab, var(--accent-gold) 15%, transparent)",
              border: "0.5px solid color-mix(in oklab, var(--accent-gold) 25%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: executing ? "default" : "pointer",
              transition: "all 160ms ease",
            }}
          >
            {executing ? (
              <div
                style={{
                  width: 12,
                  height: 12,
                  border: "1.5px solid var(--accent-gold)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 600ms linear infinite",
                }}
              />
            ) : (
              <svg viewBox="0 0 16 16" width={12} height={12} fill="var(--accent-gold)" stroke="none">
                <path d="M5 3l8 5-8 5z" />
              </svg>
            )}
          </span>
        )}
      </button>

      {/* Expanded item list */}
      {expanded && (
        <div
          style={{
            borderTop: "0.5px solid var(--glass-border)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {items.map((item, idx) => {
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx;
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                draggable={!isEditing}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderTop: isOver ? "2px solid var(--accent-gold)" : "none",
                  opacity: isDragging ? 0.4 : 1,
                  background: item.status === "running"
                    ? "color-mix(in oklab, var(--accent-gold) 5%, transparent)"
                    : item.status === "done"
                      ? "color-mix(in oklab, #22c55e 5%, transparent)"
                      : item.status === "error"
                        ? "color-mix(in oklab, var(--ember) 5%, transparent)"
                        : "transparent",
                  transition: "opacity 160ms ease, background 160ms ease",
                }}
              >
                {/* Drag handle */}
                <span
                  style={{
                    cursor: "grab",
                    color: "var(--accent-gold)",
                    opacity: 0.4,
                    fontSize: 10,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    lineHeight: 0,
                  }}
                  title="Drag to reorder"
                >
                  <span>⠿</span>
                </span>

                {/* Status indicator */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background:
                      item.status === "running" ? "var(--accent-gold)"
                        : item.status === "done" ? "#22c55e"
                          : item.status === "error" ? "var(--ember)"
                            : "var(--muted-text)",
                    boxShadow: item.status === "running" ? "0 0 6px var(--accent-gold)" : "none",
                    animation: item.status === "running" ? "pulse 1.5s ease infinite" : "none",
                  }}
                />

                {/* Text */}
                {isEditing ? (
                  <input
                    ref={editRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--accent-gold)",
                      background: "var(--surface-alt)",
                      color: "var(--foreground)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: item.status === "done" ? "var(--muted-text)" : "var(--foreground)",
                      textDecoration: item.status === "done" ? "line-through" : "none",
                      fontFamily: "var(--font-sans)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (item.status === "pending") onExecuteOne(item.id);
                    }}
                  >
                    {item.text}
                  </span>
                )}

                {/* More menu */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === item.id ? null : item.id);
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "transparent",
                      border: "none",
                      color: "var(--muted-text)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}
                  >
                    ⋯
                  </button>

                  {menuOpen === item.id && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        zIndex: 10,
                        minWidth: 130,
                        padding: "4px 0",
                        borderRadius: 10,
                        background: "rgba(28, 25, 23, 0.95)",
                        backdropFilter: "blur(16px)",
                        border: "0.5px solid var(--glass-border)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        animation: "atlas-bubble-in 120ms ease forwards",
                      }}
                    >
                      {[
                        { label: "Edit", action: () => startEdit(item) },
                        { label: "Duplicate", action: () => { onDuplicate(item.id); setMenuOpen(null); } },
                        { label: "Remove", action: () => { onRemove(item.id); setMenuOpen(null); }, color: "var(--ember)" },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={opt.action}
                          style={{
                            width: "100%",
                            padding: "8px 14px",
                            background: "transparent",
                            border: "none",
                            color: opt.color ?? "var(--foreground)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "background 100ms ease",
                          }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "color-mix(in oklab, var(--accent-gold) 8%, transparent)"; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
