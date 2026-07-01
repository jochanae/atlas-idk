// ActiveRunsStrip — inline surface for live RunCards.
//
// Renders currently active (queued/running) runs as a fixed strip anchored
// above the bottom dock, so users see the Run Card in the same surface where
// they triggered it — not only inside the Atlas Composer sheet.
//
// Frontend-only. Reads from the same module-level ActiveRuns store via
// `useAllRuns`. Does NOT alter Pass A/B RunCard styling — mounts the
// existing exported RunCard as-is. Force-apply handler is a no-op here;
// full apply-retry UX remains inside AtlasComposerSheet.

import { useAllRuns, RunCard } from "@/components/home/ActiveRuns";

interface Props {
  /** Extra bottom offset in px (e.g. dock height). Default 76. */
  bottomOffset?: number;
  /** Optional z-index. Default 255 (below dock 290, above content). */
  zIndex?: number;
}

export function ActiveRunsStrip({ bottomOffset = 76, zIndex = 255 }: Props) {
  const runs = useAllRuns();
  const live = runs.filter((r) => r.status === "queued" || r.status === "running");
  if (live.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
        zIndex,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        pointerEvents: "none",
      }}
    >
      {live.map((run) => (
        <div key={run.id} style={{ pointerEvents: "auto" }}>
          <RunCard
            run={run}
            onEnter={() => {}}
            onDismiss={() => {}}
            retryingFiles={new Set()}
            retryErrors={new Map()}
            onForceApply={() => {}}
          />
        </div>
      ))}
    </div>
  );
}
