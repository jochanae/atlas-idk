import { describe, it, expect } from "vitest";

/**
 * Lightweight validation of the Plan Mode step parser.
 * The regex and dependency-extraction logic mirrors src/routes/index.tsx.
 */

interface PlanStep {
  id: string;
  label: string;
  dependsOn: string[];
}

function parsePlanSteps(content: string): PlanStep[] {
  const stepRegex = /(?:^|\n)\s*(\d+)\.\s+\*{0,2}(.+?)\*{0,2}(?:\n|$)/g;
  const extracted: PlanStep[] = [];
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(content)) !== null) {
    const label = match[2].replace(/\*+/g, "").trim().slice(0, 60);
    const stepNum = match[1];
    const depMatch = match[2].match(/depends?\s+on\s+step\s+(\d+)/i);
    const deps: string[] = [];
    if (depMatch) {
      const depIdx = extracted.findIndex((s) => s.id.endsWith(`-${depMatch[1]}`));
      if (depIdx >= 0) deps.push(extracted[depIdx].id);
    } else if (extracted.length > 0) {
      deps.push(extracted[extracted.length - 1].id);
    }
    extracted.push({ id: `plan-${stepNum}`, label, dependsOn: deps });
  }
  return extracted;
}

describe("Plan Mode step parser", () => {
  it("extracts simple numbered steps", () => {
    // Note: the regex consumes trailing \n so each step needs its own line
    const input =
      "Here is the plan:\n" +
      "1. Set up the database schema\n" +
      "2. Create API endpoints\n" +
      "3. Build the frontend UI\n";
    const steps = parsePlanSteps(input);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({ id: "plan-1", label: "Set up the database schema", dependsOn: [] });
    expect(steps[1].dependsOn).toEqual(["plan-1"]);
    expect(steps[2].dependsOn).toEqual(["plan-2"]);
  });

  it("handles bold-wrapped step labels", () => {
    const input =
      "1. **Initialize project**\n" +
      "2. **Configure auth** (depends on step 1)\n";
    const steps = parsePlanSteps(input);
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe("Initialize project");
    expect(steps[1].dependsOn).toEqual(["plan-1"]);
  });

  it("parses explicit dependency notes", () => {
    const input =
      "1. Design schema\n" +
      "2. Seed data\n" +
      "3. Build UI (depends on step 1)\n";
    const steps = parsePlanSteps(input);
    expect(steps[2].dependsOn).toEqual(["plan-1"]);
  });

  it("returns empty array for non-plan content", () => {
    const input = "Sure, I can help with that. Let me think about the approach.";
    expect(parsePlanSteps(input)).toEqual([]);
  });

  it("truncates long labels to 60 chars", () => {
    const longLabel = "A".repeat(80);
    const input = `1. ${longLabel}\n`;
    const steps = parsePlanSteps(input);
    expect(steps[0].label.length).toBe(60);
  });

  it("handles single-star emphasis", () => {
    const input =
      "1. *Set up auth*\n" +
      "2. *Build dashboard*\n";
    const steps = parsePlanSteps(input);
    expect(steps).toHaveLength(2);
    expect(steps[0].label).toBe("Set up auth");
    expect(steps[1].label).toBe("Build dashboard");
  });
});
