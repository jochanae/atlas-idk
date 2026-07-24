import { describe, expect, it, vi } from "vitest";
import { extractPlanCardFromAssistantText } from "../planCardExtract";

describe("extractPlanCardFromAssistantText", () => {
  it("returns null for short content without calling the model", async () => {
    const create = vi.fn();
    const anthropic = { messages: { create } } as any;
    const result = await extractPlanCardFromAssistantText(anthropic, "too short");
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a structured plan when Haiku yields an actionable plan", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Add auth",
            confidence: "high",
            steps: [
              { label: "Read auth module", stepType: "read", moscow: "must", file: "src/auth.ts" },
              { label: "Add login route", stepType: "edit", moscow: "must", file: "src/routes.ts" },
            ],
            estimatedChanges: 2,
            reversible: true,
            amFields: ["pages", "logic"],
          }),
        },
      ],
    });
    const anthropic = { messages: { create } } as any;
    const prose =
      "Here is the plan.\n1. Read the auth module\n2. Add a login route\n3. Wire session cookies\nThis will change two files.";
    const result = await extractPlanCardFromAssistantText(anthropic, prose);
    expect(result).toEqual({
      type: "plan",
      title: "Add auth",
      confidence: "high",
      steps: [
        { label: "Read auth module", stepType: "read", moscow: "must", file: "src/auth.ts" },
        { label: "Add login route", stepType: "edit", moscow: "must", file: "src/routes.ts" },
      ],
      estimatedChanges: 2,
      reversible: true,
      amFields: ["pages", "logic"],
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("returns null for conversational replies with no actionable changes", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Clarifying",
            confidence: "low",
            steps: [
              { label: "Ask which screen", stepType: "other", moscow: "could" },
              { label: "Wait for answer", stepType: "other", moscow: "could" },
            ],
            estimatedChanges: 0,
            reversible: true,
          }),
        },
      ],
    });
    const anthropic = { messages: { create } } as any;
    const prose =
      "Before I plan this, which screen should we start with — home or settings? " +
      "Also, do you want OAuth or email magic links?";
    const result = await extractPlanCardFromAssistantText(anthropic, prose);
    expect(result).toBeNull();
  });
});
