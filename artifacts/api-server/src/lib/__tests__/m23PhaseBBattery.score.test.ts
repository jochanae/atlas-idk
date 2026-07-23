/**
 * Structural scorer for Phase B Map battery responses.
 * Complements the human L1–L5 review in the score sheet.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RESP = path.resolve(
  process.cwd(),
  "../../docs/audits/milestone-2-3-phase-b-battery/responses",
);

type Node = { label: string; details?: string; type?: string; strategicAnswer?: string };

function load(caseId: string, lens: string): Node[] {
  const raw = JSON.parse(fs.readFileSync(path.join(RESP, `${caseId}-${lens}.json`), "utf8")) as {
    nodes: Node[];
  };
  return raw.nodes;
}

function blob(nodes: Node[]): string {
  return nodes.map((n) => `${n.label} ${n.details ?? ""} ${n.strategicAnswer ?? ""}`).join(" ").toLowerCase();
}

function overlapRatio(a: Node[], b: Node[]): number {
  const la = new Set(a.map((n) => n.label.toLowerCase().trim()));
  const lb = new Set(b.map((n) => n.label.toLowerCase().trim()));
  let inter = 0;
  for (const x of la) if (lb.has(x)) inter++;
  return inter / Math.max(1, Math.min(la.size, lb.size));
}

describe("m2.3 Phase B battery structural scores", () => {
  const cases = ["T1", "T2", "T3", "T4", "T5", "T6"] as const;

  for (const c of cases) {
    it(`${c}: three lenses produce non-isomorphic labels`, () => {
      const d = load(c, "designer");
      const b = load(c, "builder");
      const s = load(c, "storyteller");
      expect(d.length).toBeGreaterThanOrEqual(4);
      expect(b.length).toBeGreaterThanOrEqual(4);
      expect(s.length).toBeGreaterThanOrEqual(4);
      expect(overlapRatio(d, b)).toBeLessThan(0.34);
      expect(overlapRatio(d, s)).toBeLessThan(0.34);
      expect(overlapRatio(b, s)).toBeLessThan(0.34);
    });
  }

  it("T1 Designer owns experience states / trust UX, not schema", () => {
    const t = blob(load("T1", "designer"));
    expect(t).toMatch(/empty|loading|error|join|trust|hierarchy|privacy/);
    expect(t).not.toMatch(/postgres schema|entitlements table|api route/);
  });

  it("T1 Builder owns routes/data/ship slice, not brand essay", () => {
    const t = blob(load("T1", "builder"));
    expect(t).toMatch(/route|api|authz|postgres|ship|slice|endpoint/);
    expect(t).not.toMatch(/lurker to member|founding myth|sacred/);
  });

  it("T1 Storyteller owns meaning / arc, not schema dump", () => {
    const t = blob(load("T1", "storyteller"));
    expect(t).toMatch(/belong|promise|arc|hollow|faith|safe talking/);
    expect(t).not.toMatch(/react route|postgres-backed|entitlements stub/);
  });

  it("T2 shows productive disagreement on paywall", () => {
    const builder = blob(load("T2", "builder"));
    const story = blob(load("T2", "storyteller"));
    expect(builder).toMatch(/entitlement|migration|analytics|authz/);
    expect(story).toMatch(/promise|exclusion|reject|hollow|trust/);
  });

  it("T6 only Storyteller drafts primary opening prose", () => {
    const d = blob(load("T6", "designer"));
    const b = blob(load("T6", "builder"));
    const s = blob(load("T6", "storyteller"));
    expect(s).toMatch(/don't have to figure money|you don't have to|belong before/);
    expect(d).toMatch(/hierarchy|scan|cta|viewport|placement/);
    expect(b).toMatch(/i18n|cms|component|constraint/);
    expect(d).not.toMatch(/don't have to figure money out alone/);
    expect(b).not.toMatch(/don't have to figure money out alone/);
  });
});
