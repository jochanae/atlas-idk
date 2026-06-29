// CaptureLauncher — global mount that turns the "Capture" launcher item into
// an overlay instead of navigating away. Listens for `axiom:launcher-capture`
// and renders the existing ParkSheet pre-wired with the user's projects and
// last-active project as default. Shows an upgrade nudge on free tier.
//
// Mounted once in UnifiedShell so every page benefits — never duplicate.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { ParkSheet } from "@/components/ParkSheet";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useSubscription } from "@/hooks/useSubscription";

const LAST_PROJECT_KEY = "axiom:last-project-id";

export function CaptureLauncher() {
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [, setLocation] = useLocation();
  const { data: projectsRaw } = useListProjects();
  const projects = Array.isArray(projectsRaw) ? projectsRaw : [];
  const { isFree } = useSubscription();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("axiom:launcher-capture", handler);
    return () => window.removeEventListener("axiom:launcher-capture", handler);
  }, []);

  if (!open && !showUpgrade) return null;

  const lastProjectId = (() => {
    try {
      const raw = localStorage.getItem(LAST_PROJECT_KEY);
      return raw ? parseInt(raw, 10) : null;
    } catch { return null; }
  })();
  const initialProjectId =
    lastProjectId && projects.some((p) => p.id === lastProjectId)
      ? lastProjectId
      : null;

  return (
    <>
      {open && (
        <ParkSheet
          projectId={initialProjectId}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setOpen(false)}
          onOpenFull={() => setLocation("/parking-lot?capture=1")}
          onParked={() => {
            if (isFree) {
              // Defer so the success animation reads before the upsell
              setTimeout(() => setShowUpgrade(true), 900);
            }
          }}
        />
      )}
      {showUpgrade && (
        <UpgradeModal
          reason="ledger_history"
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </>
  );
}

export default CaptureLauncher;
