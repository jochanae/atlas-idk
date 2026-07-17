// RunDetailsDrawer — canonical run/commit detail overlay.
//
// Opens on `axiom:open-changes` events. Supports either a runId (execution
// run) or a commitSha (GitHub commit) — the inner ViewChangesPanel renders
// the appropriate lens for each. While open, the composer collapses to
// hidden on mobile and compact on desktop so the drawer owns the screen.

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ViewChangesPanel } from "@/components/workspace/ViewChangesPanel";
import { useShellStore } from "@/store/shellStore";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PushRecord, LinkedRepo, ChatMessage } from "@/pages/workspace";

interface Props {
  projectId: number;
  linkedRepo: LinkedRepo | null;
  messages: ChatMessage[];
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
  projectName?: string | null;
  conversationId?: string | null;
}

function readParamsFromUrl(): { runId: string | null; commitSha: string | null } {
  if (typeof window === "undefined") return { runId: null, commitSha: null };
  const p = new URLSearchParams(window.location.search);
  return { runId: p.get("runId"), commitSha: p.get("commitSha") };
}

function clearRunAndCommitFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  if (url.searchParams.has("runId"))     { url.searchParams.delete("runId");     changed = true; }
  if (url.searchParams.has("commitSha")) { url.searchParams.delete("commitSha"); changed = true; }
  if (changed) window.history.replaceState({}, "", url.toString());
}

export function RunDetailsDrawer({
  projectId,
  linkedRepo,
  messages,
  pushHistory,
  onRollbackPush,
  projectName,
  conversationId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [{ runId, commitSha }, setParams] = useState(() => readParamsFromUrl());
  const isMobile = useIsMobile();

  const claimId = useId();
  const registerClaim = useShellStore((s) => s.registerComposerClaim);
  const releaseClaim = useShellStore((s) => s.releaseComposerClaim);

  // Open on axiom:open-changes; sync params from event detail or URL.
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ runId?: string; commitSha?: string }>).detail ?? {};
      const url = readParamsFromUrl();
      setParams({
        runId: detail.runId ?? url.runId,
        commitSha: detail.commitSha ?? url.commitSha,
      });
      setOpen(true);
    };
    window.addEventListener("axiom:open-changes", handler as EventListener);
    return () =>
      window.removeEventListener("axiom:open-changes", handler as EventListener);
  }, []);

  // If URL changes while open, keep params in sync.
  useEffect(() => {
    if (!open) return;
    const sync = () => setParams(readParamsFromUrl());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [open]);

  // Collapse the composer while the drawer owns the screen.
  useEffect(() => {
    if (!open) return;
    registerClaim(claimId, {
      source: "stage",
      kind: "run-details",
      visibility: isMobile ? "hidden" : "compact",
    });
    return () => releaseClaim(claimId);
  }, [open, isMobile, claimId, registerClaim, releaseClaim]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) clearRunAndCommitFromUrl();
  }, []);

  const { title, subtitle } = useMemo(() => {
    if (commitSha) return { title: "Commit changes", subtitle: commitSha.slice(0, 7) };
    if (runId)     return { title: "Run details",    subtitle: runId.slice(0, 8) };
    return { title: "Details", subtitle: "Select a run" };
  }, [runId, commitSha]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col gap-0 sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/40">
          <SheetTitle className="text-sm font-medium tracking-wide">
            {title}
          </SheetTitle>
          <SheetDescription className="text-xs opacity-60 font-mono">
            {subtitle}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <ViewChangesPanel
            projectId={projectId}
            linkedRepo={linkedRepo as never}
            messages={messages as never}
            pushHistory={pushHistory}
            onRollbackPush={onRollbackPush}
            runId={runId}
            commitSha={commitSha}
            projectName={projectName ?? null}
            conversationId={conversationId ?? null}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
