import { Home, Folder, BookOpen, User } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { AtlasLogo } from "./AtlasLogo";

export type FooterTab = "home" | "projects" | "ledger" | "you";

type Props = {
  active: FooterTab;
  onNavigate: (tab: FooterTab) => void;
  onCenterPress: () => void;
};

/**
 * AtlasFooterNav — persistent 5-item footer with a raised Atlas center button.
 * Layout:  [Home] [Projects] [⬢ Atlas] [Ledger] [You]
 *
 * Colors are bound to theme tokens — `--ember` resolves to Cognac (#8B4513)
 * in light mode and Muted Amber (#B45309) in Obsidian. No volcanic orange.
 */
export function AtlasFooterNav({ active, onNavigate, onCenterPress }: Props) {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: "var(--background)",
        borderTop: "0.5px solid var(--border)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          alignItems: "end",
          justifyItems: "center",
          height: 56,
          position: "relative",
        }}
      >
        <FooterItem
          label="Home"
          isActive={active === "home"}
          onClick={() => { haptic("light"); onNavigate("home"); }}
          icon={<Home size={18} strokeWidth={1.6} />}
        />
        <FooterItem
          label="Projects"
          isActive={active === "projects"}
          onClick={() => { haptic("light"); onNavigate("projects"); }}
          icon={<Folder size={18} strokeWidth={1.6} />}
        />

        {/* Center — raised Atlas button (Celestial Compass mark) */}
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <button
            type="button"
            onClick={() => { haptic("medium"); onCenterPress(); }}
            aria-label="Drop a thought"
            title="Drop a thought"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 14,
              transform: "translateX(-50%)",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--ember)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#F5F1E8",
              boxShadow:
                "0 0 0 4px var(--background)" +
                ", 0 8px 24px -6px var(--ember-glow)" +
                ", 0 0 18px -2px var(--ember-glow)",
              transition: "transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease",
            }}
            className="atlas-footer-center"
          >
            <AtlasLogo size={24} strokeWidth={1.7} />
          </button>
        </div>

        <FooterItem
          label="Ledger"
          isActive={active === "ledger"}
          onClick={() => { haptic("light"); onNavigate("ledger"); }}
          icon={<BookOpen size={18} strokeWidth={1.6} />}
        />
        <FooterItem
          label="You"
          isActive={active === "you"}
          onClick={() => { haptic("light"); onNavigate("you"); }}
          icon={<User size={18} strokeWidth={1.6} />}
        />
      </div>

      <style>{`
        .atlas-footer-center:hover { transform: translateX(-50%) translateY(-1px); }
        .atlas-footer-center:active { transform: translateX(-50%) translateY(0) scale(0.97); }
      `}</style>
    </nav>
  );
}

function FooterItem({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      style={{
        background: "transparent",
        border: "none",
        padding: "8px 4px 6px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        color: isActive ? "var(--ember)" : "var(--muted-text)",
        cursor: "pointer",
        width: "100%",
        transition: "color 160ms ease",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 20 }}>
        {icon}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}
