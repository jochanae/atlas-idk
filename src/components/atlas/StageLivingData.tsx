import { useEffect, useRef, useState } from "react";

/**
 * StageLivingData — fills the "Stage" (base layer) before a build is in progress.
 *
 *  1. Pulse — breathing Atlas "A" logo glyph
 *  2. Project Vitals — files, deploy status, health
 *  3. Blueprint Grid — subtle glassmorphism grid background
 *  4. Recent Touched Files — mini card stack
 */

interface Props {
  filesCreated?: number;
  deployStatus?: "idle" | "building" | "deployed" | "failed";
  healthScore?: number; // 0–100
  recentFiles?: Array<{ name: string; updatedAt: string }>;
}

export function StageLivingData({
  filesCreated = 0,
  deployStatus = "idle",
  healthScore = 100,
  recentFiles = [],
}: Props) {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#050505" }}>
      {/* Blueprint Grid background */}
      <BlueprintGrid />

      {/* Centered content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center gap-8 px-6 py-8">
        {/* Pulse Logo */}
        <PulseGlyph />

        {/* Project Vitals */}
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <VitalCard label="Files" value={String(filesCreated)} />
          <VitalCard label="Deploy" value={deployLabel(deployStatus)} accent={deployColor(deployStatus)} />
          <VitalCard label="Health" value={`${healthScore}%`} accent={healthScore >= 80 ? "rgba(74,222,128,0.7)" : "rgba(239,68,68,0.7)"} />
        </div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div className="w-full max-w-xs flex flex-col gap-2">
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(201,162,76,0.5)",
              }}
            >
              Recently touched
            </span>
            {recentFiles.slice(0, 3).map((f) => (
              <RecentFileCard key={f.name} name={f.name} updatedAt={f.updatedAt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pulse Glyph ── */

function PulseGlyph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame: number;
    const size = 120;
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, size * 2, size * 2);

      // Outer glow ring
      const glowRadius = 90 + Math.sin(t / 1200) * 8;
      const alpha = 0.08 + Math.sin(t / 1600) * 0.04;
      ctx.beginPath();
      ctx.arc(size, size, glowRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(201,162,76,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner glow
      const innerR = 50 + Math.sin(t / 800) * 4;
      const grad = ctx.createRadialGradient(size, size, 0, size, size, innerR);
      grad.addColorStop(0, "rgba(201,162,76,0.18)");
      grad.addColorStop(1, "rgba(201,162,76,0)");
      ctx.beginPath();
      ctx.arc(size, size, innerR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // "A" glyph
      ctx.font = "bold 52px 'Geist Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const glyphAlpha = 0.55 + Math.sin(t / 1000) * 0.15;
      ctx.fillStyle = `rgba(201,162,76,${glyphAlpha})`;
      ctx.fillText("A", size, size + 2);

      frame = requestAnimationFrame(() => draw(performance.now()));
    };

    frame = requestAnimationFrame(() => draw(performance.now()));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <canvas ref={canvasRef} aria-label="Atlas pulse indicator" role="img" />
    </div>
  );
}

/* ── Blueprint Grid ── */

function BlueprintGrid() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(rgba(201,162,76,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,162,76,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }}
    />
  );
}

/* ── Vital Card ── */

function VitalCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(201,162,76,0.15)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        textAlign: "center",
        minWidth: 80,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(201,162,76,0.45)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Geist Sans', system-ui, sans-serif",
          fontSize: 16,
          fontWeight: 600,
          color: accent ?? "rgba(232,228,221,0.85)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Recent File Card ── */

function RecentFileCard({ name, updatedAt }: { name: string; updatedAt: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.025)",
        border: "0.5px solid rgba(201,162,76,0.12)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="rgba(201,162,76,0.55)" strokeWidth={1.5}>
        <path d="M5 2v12M11 2v12M5 5h6M5 11h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: "rgba(232,228,221,0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
      </div>
      <span
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono, monospace)",
          color: "rgba(201,162,76,0.35)",
          flexShrink: 0,
        }}
      >
        {updatedAt}
      </span>
    </div>
  );
}

/* ── Helpers ── */

function deployLabel(s: string) {
  switch (s) {
    case "building": return "Building…";
    case "deployed": return "Live";
    case "failed": return "Failed";
    default: return "Idle";
  }
}

function deployColor(s: string) {
  switch (s) {
    case "building": return "rgba(250,204,21,0.8)";
    case "deployed": return "rgba(74,222,128,0.8)";
    case "failed": return "rgba(239,68,68,0.8)";
    default: return undefined;
  }
}
