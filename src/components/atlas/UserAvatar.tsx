import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type Props = {
  user: User;
  size?: number;
  onClick?: () => void;
  showStatusPulse?: boolean;
};

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || "").trim();
  if (!source) return "·";
  if (source.includes("@")) {
    const local = source.split("@")[0];
    return (local[0] || "·").toUpperCase();
  }
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({ user, size = 36, onClick, showStatusPulse = false }: Props) {
  const metaAvatar =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    null;

  const [displayName, setDisplayName] = useState<string | null>(
    (user.user_metadata?.display_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null,
  );
  const [imgFailed, setImgFailed] = useState(false);

  // Pull display_name from profiles if not in metadata.
  useEffect(() => {
    if (displayName) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data?.display_name) setDisplayName(data.display_name);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, displayName]);

  const initials = initialsFrom(displayName, user.email);
  const showImage = metaAvatar && !imgFailed;

  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={displayName || user.email || "Account"}
        title={displayName || user.email || "Account"}
        style={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: "50%",
          padding: 2,
          cursor: onClick ? "pointer" : "default",
          background: showImage
            ? "transparent"
            : "linear-gradient(135deg, #2A2724 0%, #1C1917 55%, color-mix(in oklab, var(--accent-gold) 65%, #1C1917) 100%)",
          border: `2px solid color-mix(in oklab, var(--accent-gold) 55%, transparent)`,
          boxShadow: [
            `0 0 0 2px color-mix(in oklab, var(--accent-gold) 12%, transparent)`,
            `0 0 20px -2px color-mix(in oklab, var(--accent-gold) 40%, transparent)`,
            `0 0 40px -6px color-mix(in oklab, var(--accent-gold) 20%, transparent)`,
            `0 4px 18px -4px rgba(0,0,0,0.55)`,
          ].join(", "),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
          transition:
            "transform 180ms var(--ease-cinematic), box-shadow 180ms var(--ease-cinematic), border-color 180ms var(--ease-cinematic)",
        }}
        className="atlas-avatar"
      >
        {showImage ? (
          <img
            src={metaAvatar}
            alt=""
            onError={() => setImgFailed(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              borderRadius: "50%",
            }}
          />
        ) : (
          <span
            style={{
              fontFamily:
                'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: 700,
              fontSize: Math.max(11, Math.round(size * 0.38)),
              letterSpacing: "0.02em",
              color: "color-mix(in oklab, var(--accent-gold) 75%, #F5E6C7)",
              textShadow: "0 1px 0 rgba(0,0,0,0.45)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            {initials}
          </span>
        )}
      </button>

      {showStatusPulse && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "color-mix(in oklab, var(--accent-gold) 50%, transparent)",
              boxShadow:
                "0 0 6px 1px color-mix(in oklab, var(--accent-gold) 45%, transparent), 0 0 0 1.5px color-mix(in oklab, #1C1917 70%, transparent)",
              animation: "atlas-pulse-dot 2.4s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <style>{`
            @keyframes atlas-pulse-dot {
              0%, 100% { opacity: 0.5; transform: scale(1); }
              50%      { opacity: 1;   transform: scale(1.35); }
            }
          `}</style>
        </>
      )}
    </span>
  );
}
