import { describe, expect, it } from "vitest";
import { truncateMessagesForResend } from "@/lib/threadResend";

describe("truncateMessagesForResend (M2.4 Phase C B4)", () => {
  const thread = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
    { role: "assistant", content: "d" },
  ];

  it("removes the edited user turn and everything after", () => {
    expect(truncateMessagesForResend(thread, 2)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("handles editing the first message", () => {
    expect(truncateMessagesForResend(thread, 0)).toEqual([]);
  });

  it("is a no-op for out-of-range indexes", () => {
    expect(truncateMessagesForResend(thread, -1)).toBe(thread);
    expect(truncateMessagesForResend(thread, 99)).toBe(thread);
  });
});
