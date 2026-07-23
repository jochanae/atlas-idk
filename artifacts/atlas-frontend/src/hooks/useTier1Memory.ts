/**
 * useTier1Memory — subscribe to Tier 1 project memory.
 *
 * Refetches on:
 *   - mount / projectId change
 *   - window focus
 *   - TIER1_UPDATED_EVENT (dispatched after commit or when Joy tool-calls
 *     `tier1_upsert_field` server-side — currently on a poll interval as a
 *     safety net until the chat stream forwards the tool-result to FE)
 *   - 20s poll while incomplete-and-not-skipped
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTier1Memory,
  TIER1_UPDATED_EVENT,
  type Tier1Memory,
} from "@/lib/tier1Memory";

export type UseTier1Result = {
  memory: Tier1Memory | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

export function useTier1Memory(projectId: number | null): UseTier1Result {
  const [memory, setMemory] = useState<Tier1Memory | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    if (!projectId || projectId <= 0) { setMemory(null); return; }
    setLoading(true);
    try {
      const m = await getTier1Memory(projectId);
      if (mountedRef.current) setMemory(m);
    } catch {
      /* keep prior state on error */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  useEffect(() => {
    const onFocus = () => { void refetch(); };
    const onUpdate = () => { void refetch(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(TIER1_UPDATED_EVENT, onUpdate as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(TIER1_UPDATED_EVENT, onUpdate as EventListener);
    };
  }, [refetch]);

  // Poll while incomplete and not skipped — Joy may be writing between turns.
  useEffect(() => {
    if (!projectId) return;
    const missingCount = memory?.missing?.length ?? 6;
    const skipped = Boolean(memory?.skippedAt);
    if (missingCount === 0) return;
    if (skipped && missingCount === 6) return; // fully skipped, nothing to watch
    const t = window.setInterval(() => { void refetch(); }, 20_000);
    return () => window.clearInterval(t);
  }, [projectId, memory?.missing?.length, memory?.skippedAt, refetch]);

  return { memory, loading, refetch };
}
