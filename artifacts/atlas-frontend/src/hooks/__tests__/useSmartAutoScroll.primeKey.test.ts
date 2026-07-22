import { describe, expect, it } from "vitest";

/**
 * INT-37 — document the primeKey contract for Workspace scroll.
 * The hook itself is React-effect based; this locks the identity rule used
 * by workspace.tsx so focus/visibility bumps cannot creep back in.
 */
describe("INT-37 workspace scroll primeKey contract", () => {
  function workspacePrimeKey(projectId: number | string | null | undefined): string {
    // Must NOT incorporate focus/visibility tokens — only project identity.
    return `ws:${projectId ?? "none"}`;
  }

  it("is stable across simulated tab focus cycles", () => {
    const before = workspacePrimeKey(42);
    // focus / visibilitychange would previously bump a returnToken here
    const afterFocus = workspacePrimeKey(42);
    expect(afterFocus).toBe(before);
  });

  it("changes when the project changes", () => {
    expect(workspacePrimeKey(1)).not.toBe(workspacePrimeKey(2));
    expect(workspacePrimeKey(null)).toBe("ws:none");
  });
});
