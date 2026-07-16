import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library";
import {
  semanticMetaFor,
  resolveConversationId,
  resolveProjectId,
  resolveDownloadTarget,
  isHtmlPrototype,
} from "../semanticMeta";

function baseItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "document",
    title: "Sample",
    preview: "preview",
    project: null,
    origin: { source: "ask-atlas", conversationId: "conv-1" },
    createdAt: "2026-07-16T12:00:00.000Z",
    ...overrides,
  };
}

describe("semanticMetaFor", () => {
  it("labels html-app project artifacts as Interactive Prototype", () => {
    const item = baseItem({
      kind: "sketch",
      title: "Axiom Activity Ledger",
      project: { id: 260, name: "Axiom Activity Ledger" },
      origin: { source: "workspace", conversationId: "ccfae4ac-3d23-411a-893d-e28fd5c7f897" },
      sourceRef: {
        sourceKind: "project-artifact",
        sourceId: "680",
        artifactType: "html-app",
        projectId: 260,
        conversationId: "ccfae4ac-3d23-411a-893d-e28fd5c7f897",
      },
    });
    const meta = semanticMetaFor(item);
    expect(meta.label).toBe("Interactive Prototype");
    expect(meta.primaryAction).toBe("open-draft-preview");
    expect(meta.primaryActionLabel).toBe("Open in Draft Preview");
    expect(isHtmlPrototype(item)).toBe(true);
    expect(resolveProjectId(item)).toBe(260);
    expect(resolveConversationId(item)).toBe("ccfae4ac-3d23-411a-893d-e28fd5c7f897");
    expect(resolveDownloadTarget(item)).toEqual({ projectId: 260, artifactId: "680" });
  });

  it("falls back to kind labels when sourceRef is absent", () => {
    expect(semanticMetaFor(baseItem({ kind: "bookmark" })).label).toBe("Conversation Bookmark");
    expect(semanticMetaFor(baseItem({ kind: "prd" })).label).toBe("Product Requirements Document");
  });

  it("maps pptx / docx / xlsx artifact types", () => {
    const pptx = baseItem({
      sourceRef: {
        sourceKind: "project-artifact",
        sourceId: "1",
        artifactType: "pptx",
        projectId: 9,
        conversationId: null,
      },
    });
    expect(semanticMetaFor(pptx).label).toBe("Presentation");
    expect(semanticMetaFor({
      ...pptx,
      sourceRef: { ...pptx.sourceRef!, artifactType: "docx" },
    }).label).toBe("Document");
    expect(semanticMetaFor({
      ...pptx,
      sourceRef: { ...pptx.sourceRef!, artifactType: "xlsx" },
    }).label).toBe("Spreadsheet");
  });
});
