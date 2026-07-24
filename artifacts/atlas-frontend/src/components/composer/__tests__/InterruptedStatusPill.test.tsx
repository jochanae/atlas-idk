import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  InterruptedStatusPill,
  softenInterruptedContent,
} from "../InterruptedStatusPill";

afterEach(() => {
  cleanup();
});

describe("InterruptedStatusPill", () => {
  it("shows interrupted copy for queued newer requests", () => {
    render(<InterruptedStatusPill reason="newer_request" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Interrupted · New request started",
    );
  });

  it("shows Stopped for manual user stop", () => {
    render(<InterruptedStatusPill reason="user_stop" />);
    expect(screen.getByRole("status").textContent).toContain("Stopped");
  });
});

describe("softenInterruptedContent", () => {
  it("clears short progressive claims so they do not look still-active", () => {
    expect(softenInterruptedContent("Generating this now...")).toBe("");
    expect(softenInterruptedContent("I'm generating the document")).toBe("");
    expect(softenInterruptedContent("One moment")).toBe("");
  });

  it("keeps substantive partial answers", () => {
    const partial =
      "# Project Brief\n\nHere is the outline we started before the newer request.";
    expect(softenInterruptedContent(partial)).toBe(partial);
  });
});
