import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MENU_ITEMS = [
  {
    id: "attach",
    label: "Attach",
    description: "Files & images",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.2 7.3 8 12.5a3 3 0 1 1-4.2-4.2l5.6-5.6a2 2 0 1 1 2.8 2.8L6.6 11.1a1 1 0 1 1-1.4-1.4l4.9-4.9" />
      </svg>
    ),
  },
  {
    id: "blueprints",
    label: "Blueprints & Templates",
    description: "Wireframes & pre-styled UI kits",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5" height="5" rx="0.5" />
        <rect x="9" y="2" width="5" height="5" rx="0.5" />
        <rect x="2" y="9" width="5" height="5" rx="0.5" />
        <rect x="9" y="9" width="5" height="5" rx="0.5" />
      </svg>
    ),
  },
  {
    id: "design",
    label: "Design",
    description: "Themes & CSS architecture",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: "filetree",
    label: "File Tree",
    description: "Browse generated files",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13V3h4l2 2h6v8z" />
      </svg>
    ),
  },
  {
    id: "diff",
    label: "Diff Tracker",
    description: "Compare code versions",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h10M2 2h5v5H2zM9 9h5v5H9z" />
      </svg>
    ),
  },
  {
    id: "collaborate",
    label: "Collaborate",
    description: "Share & comment with team",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="11" cy="11" r="3" />
        <path d="M8.5 4.5l3 3" />
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    description: "Sync repo & branches",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    ),
  },
  {
    id: "snapshots",
    label: "Snapshots",
    description: "Browse & restore rollback history",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8a6 6 0 1112 0A6 6 0 012 8z" opacity={0.4} />
        <path d="M8 4v4l2.5 1.5" />
      </svg>
    ),
  },
  {
    id: "connectors",
    label: "Connectors",
    description: "APIs & integrations",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h4M6 13h4M3 6v4M13 6v4" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    ),
  },
  {
    id: "databases",
    label: "Databases",
    description: "Memory, ledgers & storage",
    icon: (
      <svg viewBox="0 0 16 16" width={16} height={16} stroke="currentColor" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="8" cy="4" rx="5" ry="2" />
        <path d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4" />
        <path d="M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" />
      </svg>
    ),
  },
] as const;

function triggerHaptic(style: "pulse" | "thump") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(style === "pulse" ? 10 : 30);
  }
}

interface SystemMenuProps {
  onSelect?: (id: string) => void;
  userId?: string;
  projectId?: string | null;
  /** Called after files are uploaded with their public URLs */
  onFilesUploaded?: (files: Array<{ name: string; url: string; type: string }>) => void;
}

export function SystemMenu({ onSelect, userId, projectId, onFilesUploaded }: SystemMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) triggerHaptic("pulse");
  };

  const handleSelect = (id: string) => {
    if (id === "attach") {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/*,application/pdf,.doc,.docx,.txt,.csv,.json";
      input.onchange = async () => {
        if (!input.files?.length) return;
        if (!userId) {
          toast.error("Sign in to attach files");
          return;
        }
        triggerHaptic("thump");
        const uploaded: Array<{ name: string; url: string; type: string }> = [];
        for (const file of Array.from(input.files)) {
          const path = `${userId}/${projectId ?? "general"}/${Date.now()}-${file.name}`;
          const { error } = await supabase.storage
            .from("project-assets")
            .upload(path, file, { upsert: false });
          if (error) {
            toast.error(`Upload failed: ${file.name}`);
            continue;
          }
          const { data: urlData } = supabase.storage
            .from("project-assets")
            .getPublicUrl(path);
          uploaded.push({
            name: file.name,
            url: urlData.publicUrl,
            type: file.type,
          });
        }
        if (uploaded.length > 0) {
          toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} attached`);
          onFilesUploaded?.(uploaded);
        }
        onSelect?.(id);
      };
      input.click();
    } else {
      onSelect?.(id);
    }
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Backdrop blur */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            background: "rgba(0,0,0,0.25)",
            animation: "atlas-sys-backdrop-in 250ms ease forwards",
          }}
        />
      )}

      <div style={{ position: "relative" }}>
        {/* Plus button trigger */}
        <button
          ref={btnRef}
          type="button"
          aria-label="System menu"
          aria-expanded={open}
          onClick={toggle}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: open ? "var(--surface-alt)" : "transparent",
            border: open ? "1px solid var(--accent-gold)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: open
              ? "var(--accent-gold)"
              : "color-mix(in oklab, var(--accent-gold) 55%, var(--muted-text))",
            cursor: "pointer",
            opacity: open ? 1 : 0.55,
            transition:
              "opacity 160ms var(--ease-cinematic), color 160ms var(--ease-cinematic), transform 260ms var(--ease-cinematic), background 160ms var(--ease-cinematic)",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            flexShrink: 0,
            position: "relative",
            zIndex: 92,
          }}
        >
          <svg viewBox="0 0 16 16" width={15} height={15} stroke="currentColor" fill="none" strokeWidth={1.6}>
            <path d="M8 3v10M3 8h10" strokeLinecap="round" />
          </svg>
        </button>

        {/* Menu panel */}
        {open && (
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              bottom: "calc(100% + 10px)",
              left: 0,
              zIndex: 92,
              minWidth: 220,
              maxHeight: "min(360px, calc(100dvh - 120px))",
              overflowY: "auto",
              background: "rgba(28, 25, 23, 0.88)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid color-mix(in oklab, var(--accent-gold) 25%, transparent)",
              borderRadius: 12,
              padding: "6px 0",
              boxShadow:
                "0 24px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(201,162,76,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
              animation: "atlas-sys-menu-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
              transformOrigin: "bottom left",
            }}
          >
            {MENU_ITEMS.map((item, i) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--foreground)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  textAlign: "left",
                  transition: "background 120ms ease",
                  animation: `atlas-sys-item-in 180ms ease ${60 + i * 40}ms backwards`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "color-mix(in oklab, var(--accent-gold) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                    border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, transparent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent-gold)",
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontWeight: 500, letterSpacing: "0.01em" }}>{item.label}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted-text)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
