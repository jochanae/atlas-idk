import { describe, expect, it } from "vitest";
import { collapseRepeatedTail } from "../collapseRepeatedTail";

describe("collapseRepeatedTail", () => {
  it("collapses a duplicated closing question glued without separator", () => {
    const q =
      "What feels most alive to you right now — the structure of what she experiences inside the community, or who she is and how she finds it first?";
    const input = `A few things worth thinking through.\n\n${q}${q}`;
    expect(collapseRepeatedTail(input)).toBe(`A few things worth thinking through.\n\n${q}`);
  });

  it("collapses consecutive identical paragraphs", () => {
    const p = "Does this framework feel true to what you've been building toward?";
    expect(collapseRepeatedTail(`${p}\n\n${p}`)).toBe(p);
  });

  it("leaves normal prose alone", () => {
    const text =
      "First paragraph with enough length to avoid early exits in the helper.\n\nSecond paragraph that is different and should remain intact.";
    expect(collapseRepeatedTail(text)).toBe(text);
  });
});
