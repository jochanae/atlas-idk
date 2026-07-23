import { describe, expect, it } from "vitest";
import {
  ASK_ATLAS_HANDOFF_SURFACE_CONTRACT,
  CREATE_PROJECT_SUCCESS_INSTRUCTION,
  isDeliverableOnlyRequest,
  messageHasExplicitCreateSignal,
  shouldForceCreateProject,
} from "../askAtlasHandoffContract";

describe("ASK_ATLAS_HANDOFF_SURFACE_CONTRACT (INT-35)", () => {
  it("forbids false creation / opening claims", () => {
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/I'll create/i);
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/Creating the workspace/i);
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/Opening the Workspace now/i);
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/does NOT create a project by itself/i);
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/PROJECT_READY/);
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).not.toMatch(
      /The server creates the project and handles navigation/i,
    );
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).not.toMatch(
      /A new project will be created server-side/i,
    );
  });

  it("coaches tap-to-open phrasing instead of I'll-create", () => {
    expect(ASK_ATLAS_HANDOFF_SURFACE_CONTRACT).toMatch(/ready when you want the workspace/i);
  });
});

describe("shouldForceCreateProject (INT-35)", () => {
  const base = {
    allowToolAccess: true,
    allowBuildSideEffects: false,
    intent: "BUILD",
    focusProjectId: null as number | null,
    surfaceContext: "ask-atlas" as const,
  };

  it("forces create on Ask Atlas when user explicitly asks to create the workspace", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "Please create the workspace for this deck.",
      }),
    ).toBe(true);
  });

  it("does not force create for deliverable-only requests (make me a spreadsheet)", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "Make me a spreadsheet of the pricing options.",
      }),
    ).toBe(false);
  });

  it("does not force create for create a powerpoint", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "Create a powerpoint summarizing this conversation.",
      }),
    ).toBe(false);
  });

  it("does not force create for build the full product brief (file, not workspace)", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "build the full product brief",
      }),
    ).toBe(false);
  });

  it("does not force create on exploratory BUILD without explicit create phrasing", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "What would a workspace for this look like?",
      }),
    ).toBe(false);
  });

  it("does not force create inside an already-focused project", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        message: "create the workspace",
        focusProjectId: 42,
      }),
    ).toBe(false);
  });

  it("does not force create on CHAT / DECIDE Ask Atlas turns", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        intent: "CHAT",
        message: "create the workspace",
      }),
    ).toBe(false);
  });

  it("still forces on workspace BUILD without focus (legacy path)", () => {
    expect(
      shouldForceCreateProject({
        ...base,
        allowBuildSideEffects: true,
        surfaceContext: "workspace",
        message: "build me a habit tracker",
      }),
    ).toBe(true);
  });
});

describe("isDeliverableOnlyRequest", () => {
  it("recognizes spreadsheet / deck / pdf asks", () => {
    expect(isDeliverableOnlyRequest("Make me a spreadsheet")).toBe(true);
    expect(isDeliverableOnlyRequest("Can you generate a powerpoint deck?")).toBe(true);
    expect(isDeliverableOnlyRequest("Export this as a PDF")).toBe(true);
  });

  it("recognizes product brief / one-pager / executive summary asks", () => {
    expect(isDeliverableOnlyRequest("build the full product brief")).toBe(true);
    expect(isDeliverableOnlyRequest("Write a product brief from this conversation")).toBe(true);
    expect(isDeliverableOnlyRequest("Generate an executive summary")).toBe(true);
    expect(isDeliverableOnlyRequest("Make me a one-pager")).toBe(true);
  });

  it("rejects workspace / project management asks", () => {
    expect(isDeliverableOnlyRequest("Please create the workspace")).toBe(false);
    expect(isDeliverableOnlyRequest("Turn this into a project")).toBe(false);
    expect(isDeliverableOnlyRequest("build me a habit tracker")).toBe(false);
    expect(isDeliverableOnlyRequest("build me a product")).toBe(false);
  });
});

describe("messageHasExplicitCreateSignal", () => {
  it("matches create the workspace", () => {
    expect(messageHasExplicitCreateSignal("Please create the workspace")).toBe(true);
  });

  it("rejects bare assent without create object", () => {
    expect(messageHasExplicitCreateSignal("yes")).toBe(false);
    expect(messageHasExplicitCreateSignal("go ahead")).toBe(false);
  });
});

describe("CREATE_PROJECT_SUCCESS_INSTRUCTION", () => {
  it("confirms create without claiming auto-navigation", () => {
    const text = CREATE_PROJECT_SUCCESS_INSTRUCTION("Demo", 7, "");
    expect(text).toMatch(/tap Open Workspace/i);
    expect(text).not.toMatch(/opening the workspace now/i);
    expect(text).toMatch(/Do NOT claim the workspace is already open/i);
  });
});
