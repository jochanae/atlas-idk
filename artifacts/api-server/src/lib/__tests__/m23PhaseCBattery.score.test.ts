/**
 * Structural scorer for Phase C live-chat battery responses.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RESP = path.resolve(
  process.cwd(),
  "../../docs/audits/milestone-2-3-phase-c-battery/responses",
);

function load(caseId: string, lens: string): string {
  const raw = JSON.parse(fs.readFileSync(path.join(RESP, `${caseId}-${lens}.json`), "utf8")) as {
    reply: string;
  };
  return raw.reply.toLowerCase();
}

describe("m2.3 Phase C live-chat battery structural scores", () => {
  it("T1 Designer owns experience, not schema", () => {
    const t = load("T1", "designer");
    expect(t).toMatch(/empty|join|hierarchy|trust|mute|state/);
    expect(t).not.toMatch(/entitlements table|postgres scopes|\/community route/);
  });

  it("T1 Builder owns construction checklist", () => {
    const t = load("T1", "builder");
    expect(t).toMatch(/route|api|authz|postgres|ship|slice|out of scope/);
    expect(t).not.toMatch(/lurker →|founding identity|sacred/);
  });

  it("T1 Storyteller owns meaning / promise", () => {
    const t = load("T1", "storyteller");
    expect(t).toMatch(/promise|belong|hollow|arc|safe talking|house/);
    expect(t).not.toMatch(/\/community|entitlements stub|pr plan/);
  });

  it("T2 shows disagreement on paywall", () => {
    expect(load("T2", "builder")).toMatch(/entitlement|migration|enforce/);
    expect(load("T2", "storyteller")).toMatch(/no —|reject|promise|exclusion|meaning failure/);
  });

  it("T6 only Storyteller drafts primary opening prose", () => {
    const s = load("T6", "storyteller");
    const d = load("T6", "designer");
    const b = load("T6", "builder");
    expect(s).toMatch(/don['’]t have to figure money|you don['’]t have to/);
    expect(d).toMatch(/viewport|hierarchy|cta|placement/);
    expect(b).toMatch(/i18n|cms|component/);
    expect(d).not.toMatch(/don['’]t have to figure money out alone/);
    expect(b).not.toMatch(/don['’]t have to figure money out alone/);
  });

  for (const c of ["T1", "T2", "T3", "T4", "T5", "T6"]) {
    it(`${c}: three replies are non-trivial and distinct`, () => {
      const d = load(c, "designer");
      const b = load(c, "builder");
      const s = load(c, "storyteller");
      expect(d.split(/\s+/).length).toBeGreaterThan(40);
      expect(b.split(/\s+/).length).toBeGreaterThan(30);
      expect(s.split(/\s+/).length).toBeGreaterThan(30);
      // crude distinctness: Jaccard on word sets should not be near 1
      const set = (t: string) => new Set(t.split(/\s+/).filter((w) => w.length > 4));
      const j = (a: Set<string>, b: Set<string>) => {
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        return inter / Math.max(1, Math.min(a.size, b.size));
      };
      expect(j(set(d), set(b))).toBeLessThan(0.55);
      expect(j(set(d), set(s))).toBeLessThan(0.55);
      expect(j(set(b), set(s))).toBeLessThan(0.55);
    });
  }
});
