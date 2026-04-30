import { useState } from "react";
import { X } from "lucide-react";

/* ──────────────────────────────────────────────────────────
   Blueprints & Templates Library
   
   A bottom-sheet drawer with curated structural wireframes
   (Blueprints) and pre-styled UI kits (Templates) that can
   be instantly deployed into the codegen pipeline.
   ────────────────────────────────────────────────────────── */

export type BlueprintCategory = "wireframe" | "template";

export interface BlueprintItem {
  id: string;
  name: string;
  description: string;
  category: BlueprintCategory;
  tags: string[];
  /** The prompt that gets sent to atlas-codegen when deployed */
  codegenPrompt: string;
  /** SVG preview thumbnail (inline) */
  thumbnail: string;
}

// ─── Curated library ─────────────────────────────────────

const BLUEPRINTS: BlueprintItem[] = [
  // ─── Wireframes (structural) ───
  {
    id: "hero-cta",
    name: "Hero + CTA",
    description: "Full-width hero section with headline, subtext, and call-to-action button.",
    category: "wireframe",
    tags: ["landing", "hero", "marketing"],
    codegenPrompt:
      "A full-width hero section with a large headline, one line of subtext below, and a prominent CTA button. Dark background, centered content, responsive. Include a subtle gradient overlay.",
    thumbnail: "hero",
  },
  {
    id: "pricing-grid",
    name: "Pricing Grid",
    description: "Three-tier pricing cards with feature lists and highlighted recommended tier.",
    category: "wireframe",
    tags: ["pricing", "saas", "cards"],
    codegenPrompt:
      "A three-column pricing grid. Each card has a plan name, price, feature list with checkmarks, and a CTA button. The middle card is highlighted as 'recommended' with a gold border and slightly elevated. Responsive — stacks to single column on mobile.",
    thumbnail: "pricing",
  },
  {
    id: "feature-zigzag",
    name: "Feature Zigzag",
    description: "Alternating image-text rows showcasing product features.",
    category: "wireframe",
    tags: ["features", "marketing", "zigzag"],
    codegenPrompt:
      "An alternating zigzag layout with 3 sections. Each section has an image placeholder on one side and text (heading + paragraph) on the other, alternating left-right. Include subtle dividers between sections.",
    thumbnail: "zigzag",
  },
  {
    id: "dashboard-shell",
    name: "Dashboard Shell",
    description: "Sidebar navigation + header + main content area with stat cards.",
    category: "wireframe",
    tags: ["dashboard", "admin", "layout"],
    codegenPrompt:
      "A dashboard layout with a dark sidebar (navigation links with icons), a top header bar (search input + user avatar), and a main content area with 4 stat cards in a grid (icon, label, value, trend indicator).",
    thumbnail: "dashboard",
  },
  {
    id: "auth-form",
    name: "Auth Screen",
    description: "Sign in / sign up form with social login buttons.",
    category: "wireframe",
    tags: ["auth", "login", "form"],
    codegenPrompt:
      "A centered authentication form with email input, password input, a 'Sign In' button, 'Continue with Google' and 'Continue with Apple' social buttons, and a 'Create account' link. Dark theme with subtle card border.",
    thumbnail: "auth",
  },
  {
    id: "card-grid",
    name: "Card Grid",
    description: "Responsive grid of content cards with image, title, and description.",
    category: "wireframe",
    tags: ["grid", "cards", "content"],
    codegenPrompt:
      "A responsive grid of 6 content cards (2 or 3 columns on desktop, 1 on mobile). Each card has an image placeholder area (16:9 ratio), a title, a short description, and a subtle tag/category label.",
    thumbnail: "grid",
  },

  // ─── Templates (pre-styled) ───
  {
    id: "obsidian-landing",
    name: "Obsidian Landing",
    description: "Full landing page in Luxury Obsidian theme — hero, features, testimonials, CTA.",
    category: "template",
    tags: ["landing", "obsidian", "full-page"],
    codegenPrompt:
      "A complete landing page with Luxury Obsidian styling (dark bg #1a1814, gold accents #c9a24c, glassmorphism panels). Sections: hero with headline + CTA, 3-feature grid with icons, a testimonial quote, and a final CTA section. Use subtle gold borders and glass-effect cards.",
    thumbnail: "landing",
  },
  {
    id: "obsidian-profile",
    name: "Profile Card",
    description: "User profile card with avatar, stats, and action buttons in obsidian style.",
    category: "template",
    tags: ["profile", "card", "obsidian"],
    codegenPrompt:
      "A centered profile card with a circular avatar placeholder, display name, bio text, a row of 3 stats (posts, followers, following), and two buttons (Follow, Message). Luxury Obsidian theme with glassmorphism card, gold accent on the Follow button.",
    thumbnail: "profile",
  },
  {
    id: "obsidian-settings",
    name: "Settings Panel",
    description: "Settings page with toggle switches and grouped options.",
    category: "template",
    tags: ["settings", "form", "obsidian"],
    codegenPrompt:
      "A settings panel with grouped option rows. Each row has a label, description, and a toggle switch. Groups: 'Notifications' (3 toggles), 'Privacy' (2 toggles), 'Appearance' (theme selector). Obsidian dark theme with gold toggle active states.",
    thumbnail: "settings",
  },
  {
    id: "obsidian-onboarding",
    name: "Onboarding Flow",
    description: "Multi-step onboarding wizard with progress indicator.",
    category: "template",
    tags: ["onboarding", "wizard", "obsidian"],
    codegenPrompt:
      "A multi-step onboarding wizard showing step 2 of 4. Top: progress dots (gold for completed, dim for upcoming). Center: form content with a 'What are you building?' text input and 3 option cards to select from. Bottom: 'Back' and 'Continue' buttons. Obsidian theme.",
    thumbnail: "onboarding",
  },
];

// ─── Thumbnail SVGs ──────────────────────────────────────

function BlueprintThumb({ type }: { type: string }) {
  const common = {
    width: "100%",
    height: "100%",
    viewBox: "0 0 120 80",
  } as const;
  const bg = "rgba(201,162,76,0.06)";
  const line = "rgba(201,162,76,0.35)";
  const accent = "rgba(201,162,76,0.6)";

  switch (type) {
    case "hero":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="30" y="18" width="60" height="6" rx="2" fill={accent} />
          <rect x="35" y="30" width="50" height="3" rx="1" fill={line} />
          <rect x="42" y="48" width="36" height="10" rx="4" fill={accent} />
        </svg>
      );
    case "pricing":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="6" y="10" width="32" height="60" rx="3" fill={line} />
          <rect x="44" y="6" width="32" height="68" rx="3" fill={accent} />
          <rect x="82" y="10" width="32" height="60" rx="3" fill={line} />
        </svg>
      );
    case "zigzag":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="8" y="8" width="40" height="18" rx="2" fill={line} />
          <rect x="54" y="8" width="58" height="3" rx="1" fill={accent} />
          <rect x="54" y="14" width="46" height="3" rx="1" fill={line} />
          <rect x="8" y="52" width="58" height="3" rx="1" fill={accent} />
          <rect x="8" y="58" width="46" height="3" rx="1" fill={line} />
          <rect x="72" y="44" width="40" height="18" rx="2" fill={line} />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="0" y="0" width="28" height="80" rx="4" fill={line} />
          <rect x="34" y="14" width="20" height="14" rx="2" fill={accent} />
          <rect x="58" y="14" width="20" height="14" rx="2" fill={line} />
          <rect x="82" y="14" width="20" height="14" rx="2" fill={accent} />
          <rect x="34" y="34" width="68" height="40" rx="2" fill={line} />
        </svg>
      );
    case "auth":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="30" y="10" width="60" height="60" rx="6" fill={line} />
          <rect x="38" y="22" width="44" height="6" rx="2" fill={accent} />
          <rect x="38" y="34" width="44" height="6" rx="2" fill={accent} />
          <rect x="38" y="50" width="44" height="8" rx="3" fill="rgba(201,162,76,0.5)" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            return (
              <rect
                key={i}
                x={6 + col * 38}
                y={6 + row * 38}
                width="34"
                height="34"
                rx="3"
                fill={i % 2 === 0 ? accent : line}
              />
            );
          })}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="120" height="80" rx="4" fill={bg} />
          <rect x="20" y="20" width="80" height="40" rx="6" fill={accent} />
        </svg>
      );
  }
}

// ─── Component ───────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onDeploy: (item: BlueprintItem) => void;
};

export function BlueprintsDrawer({ open, onClose, onDeploy }: Props) {
  const [filter, setFilter] = useState<"all" | BlueprintCategory>("all");
  const [deploying, setDeploying] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? BLUEPRINTS
      : BLUEPRINTS.filter((b) => b.category === filter);

  const handleDeploy = (item: BlueprintItem) => {
    setDeploying(item.id);
    onDeploy(item);
    setTimeout(() => {
      setDeploying(null);
      onClose();
    }, 600);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 80,
          animation: "atlas-fade-in 200ms ease",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "85vh",
          zIndex: 81,
          background: "rgba(28, 25, 23, 0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
          borderBottom: "none",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "atlas-sys-menu-in 280ms cubic-bezier(0.34, 1.2, 0.64, 1)",
          transformOrigin: "bottom center",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--foreground)",
                letterSpacing: "0.01em",
                margin: 0,
              }}
            >
              Blueprints & Templates
            </h2>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--muted-text)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              {filtered.length} items
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter pills */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "12px 20px",
            flexShrink: 0,
          }}
        >
          {(["all", "wireframe", "template"] as const).map((f) => {
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  border: `0.5px solid ${isActive ? "var(--accent-gold)" : "var(--border)"}`,
                  background: isActive
                    ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
                    : "transparent",
                  color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 160ms ease",
                }}
              >
                {f === "all" ? "All" : f === "wireframe" ? "Blueprints" : "Templates"}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 16px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            alignContent: "start",
          }}
        >
          {filtered.map((item) => {
            const isDeploying = deploying === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleDeploy(item)}
                disabled={!!deploying}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 12,
                  borderRadius: 12,
                  border: `0.5px solid ${isDeploying ? "var(--accent-gold)" : "color-mix(in oklab, var(--accent-gold) 12%, var(--border))"}`,
                  background: isDeploying
                    ? "color-mix(in oklab, var(--accent-gold) 8%, var(--surface))"
                    : "var(--surface)",
                  cursor: deploying ? "default" : "pointer",
                  textAlign: "left",
                  transition: "all 200ms ease",
                  opacity: deploying && !isDeploying ? 0.5 : 1,
                }}
              >
                {/* Thumbnail */}
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "3 / 2",
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "rgba(0,0,0,0.3)",
                  }}
                >
                  <BlueprintThumb type={item.thumbnail} />
                </div>

                {/* Name + category badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--foreground)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color:
                        item.category === "template"
                          ? "var(--accent-gold)"
                          : "var(--muted-text)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background:
                        item.category === "template"
                          ? "color-mix(in oklab, var(--accent-gold) 12%, transparent)"
                          : "color-mix(in oklab, var(--muted-text) 12%, transparent)",
                      flexShrink: 0,
                    }}
                  >
                    {item.category === "wireframe" ? "BP" : "TPL"}
                  </span>
                </div>

                {/* Description */}
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 10.5,
                    color: "var(--muted-text)",
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.description}
                </span>

                {/* Deploy indicator */}
                {isDeploying && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--accent-gold)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Deploying…
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
