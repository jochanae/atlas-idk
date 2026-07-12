import type { RunChange, RunArtifact } from "@contract";

/**
 * Mock hydration registry — the provider's fetchChanges / fetchOutputs
 * delegate here so scripted stories can inject latency and error flavors
 * per runId. Phase 2 will replace this with the real /api/runs/:id/…
 * endpoints; nothing outside the provider should import this module.
 */
export type Flavor = "success" | "empty" | "slow" | "error";

interface Entry {
  changes: Flavor;
  outputs: Flavor;
  changesData?: RunChange[];
  outputsData?: RunArtifact[];
}

const registry = new Map<string, Entry>();

export function registerHydration(runId: string, entry: Entry) {
  registry.set(runId, entry);
}

export function getEntry(runId: string): Entry | undefined {
  return registry.get(runId);
}

export function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((res) => setTimeout(() => res(value), ms));
}

/** Auto-derive a changes list from a run's plan when no explicit fixture. */
export function derivedChanges(runId: string, items: { seq: number; filePath: string; verb: string }[]): RunChange[] {
  return items.map((it) => ({
    stepId: `${runId}-step-${it.seq}`,
    filePath: it.filePath,
    verb: (it.verb === "MUST" || it.verb === "SHOULD" || it.verb === "COULD" ? "FILE_EDIT" : "FILE_EDIT") as RunChange["verb"],
    beforeContent: null,
    afterContent: null,
    status: "applied",
  }));
}
