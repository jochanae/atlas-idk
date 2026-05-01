import { Home, Folder, BookOpen, User } from "lucide-react";
import { haptic } from "@/lib/haptics";

export type FooterTab = "home" | "projects" | "ledger" | "you";

type Props = {
  active: FooterTab;
  onNavigate: (tab: FooterTab) => void;
  onCenterPress: () => void;
};

const EMBER = "#EA580C";
const BG = "#0C0A09";
const BORDER = "#1C1917";
const LABEL = "#3C3530";

/**
 * AtlasFooterNav — persistent 5-item footer with a raised Atlas center button.
 * Layout:  [Home] [Projects] [⬢ Atlas] [Ledger] [You]
 *
 * The center button sits above the bar (52px circle, ember orange) and
 * triggers a quick-thought sheet from the parent. Tapping it from anywhere
 * in the app drops a thought into the active session without navigating away.
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
        background: BG,
        borderTop: `0.5px solid ${BORDER}`,
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

        {/* Center — raised Atlas button */}
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
              borderRadius: "50%",
              background: EMBER,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow:
                "0 0 0 4px " + BG +
                ", 0 8px 24px -6px rgba(234,88,12,0.55)" +
                ", 0 0 18px -2px rgba(234,88,12,0.45)",
              transition: "transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease",
            }}
            className="atlas-footer-center"
          >
            {/* Atlas hex glyph */}
            <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#0C0A09" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" />
              <path d="M12 8 V16 M8 10 H16" opacity="0.55" />
            </svg>
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
  const color = isActive ? EMBER : LABEL;
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
        color,
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
          color,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}
