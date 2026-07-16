// RunDetailsDrawer — Slice 2 canonical run-detail surface.
// Wraps ViewChangesPanel inside a right-side Sheet so that Details buttons
// (from WorkspaceRunCard, ActiveCard, WorkspaceRunReceipts pills, and future
// commit receipts) open ONE consistent detail surface on both mobile and
// desktop, instead of only switching the workspace leftTab.
//
// Contract:
// - Opens on `axiom:open-changes` window events (see workspace.tsx handler).
// - Reads runId from `?runId=` in the URL, kept in sync by the same handler.
// - On close, strips `?runId` so subsequent opens start clean.
// - Inside, ViewChangesPanel handles its own tab (Timeline / Changes / Decisions)
//   and its own run-picker pills; the drawer is a shell, not a re-implementation.

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ViewChangesPanel } from "@/components/workspace/ViewChangesPanel";
import type { PushRecord } from "@/hooks/usePushHistory";

interface LinkedRepo {
  owner: string;
  repo: string;
  branch?: string | null;
}

interface TimelineMessage {
  id: string | number;
  role: string;
  content: string;
  sentAt?: string;
}

interface Props {
  projectId: number;
  linkedRepo: LinkedRepo | null;
  messages: TimelineMessage[];
  pushHistory: PushRecord[];
  onRollbackPush: (record: PushRecord) => Promise<void>;
  projectName?: string | null;
  conversationId?: string | null;
}

function readRunIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("runId");
}

function clearRunIdFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("runId")) return;
  url.searchParams.delete("runId");
  window.history.replaceState({}, "", url.toString());
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
  const [runId, setRunId] = useState<string | null>(() => readRunIdFromUrl());

  // Open on axiom:open-changes; sync runId from event detail or URL.
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ runId?: string }>).detail;
      const next = detail?.runId ?? readRunIdFromUrl();
      setRunId(next ?? null);
      setOpen(true);
    };
    window.addEventListener("axiom:open-changes", handler as EventListener);
    return () =>
      window.removeEventListener("axiom:open-changes", handler as EventListener);
  }, []);

  // If URL changes (back/forward, or receipt pill click inside the panel that
  // updates the URL), keep the drawer's runId in sync while it's open.
  useEffect(() => {
    if (!open) return;
    const sync = () => setRunId(readRunIdFromUrl());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [open]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) clearRunIdFromUrl();
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full p-0 flex flex-col gap-0 sm:max-w-2xl lg:max-w-3xl"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/40">
          <SheetTitle className="text-sm font-medium tracking-wide">
            Run details
          </SheetTitle>
          <SheetDescription className="text-xs opacity-60 font-mono">
            {runId ? runId.slice(0, 8) : "Select a run"}
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
            projectName={projectName ?? null}
            conversationId={conversationId ?? null}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
