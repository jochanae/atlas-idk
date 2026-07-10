import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/objectStorage", () => {
  class ObjectStorageService {
    async getObjectEntityFile(objectPath: string) {
      return {
        objectPath,
        exists: async () => [true],
        download: async () => [Buffer.from("hello world")],
      } as never;
    }
  }
  class ObjectNotFoundError extends Error {}
  return { ObjectStorageService, ObjectNotFoundError };
});

import { classifyFailure, verifyArtifact, registerArtifactVerifier } from "../lib/verificationEngine";
import type { ArtifactRenderOutput } from "../lib/artifactEngine";

const baseRendered: ArtifactRenderOutput = {
  buffer: Buffer.from("hello world"),
  title: "Test Artifact",
  mimeType: "text/plain",
  extension: "txt",
  preview: { note: "preview payload" },
};

describe("classifyFailure", () => {
  it("classifies credential/permission/schema issues as permanent (never retried)", () => {
    expect(classifyFailure("Missing credentials for storage bucket")).toBe("permanent");
    expect(classifyFailure("Forbidden: insufficient permission")).toBe("permanent");
    expect(classifyFailure("no renderer registered for type xyz")).toBe("permanent");
  });

  it("classifies network/storage blips as transient (retried once)", () => {
    expect(classifyFailure("fetch failed: ECONNRESET")).toBe("transient");
    expect(classifyFailure("Request timeout while uploading")).toBe("transient");
  });

  it("classifies truncation/empty-content issues as content-shape (retried once)", () => {
    expect(classifyFailure("Output looks truncated — fewer slides than expected.")).toBe("content-shape");
    expect(classifyFailure("Generation may have been cut off before completing.")).toBe("content-shape");
  });
});

describe("verifyArtifact — universal checks", () => {
  it("passes when renderer/storage/row/ledger/preview are all healthy", async () => {
    const result = await verifyArtifact({
      type: "__no_verifier_registered__",
      category: "draft",
      projectId: 1,
      input: {},
      rendered: baseRendered,
      objectPath: "/objects/uploads/abc",
      rowPersisted: true,
      ledgerEntryId: 900,
    });
    expect(result.status).toBe("verified");
    expect(result.checks.every((c) => c.pass)).toBe(true);
  });

  it("fails with a real reason when the ledger entry was not created", async () => {
    const result = await verifyArtifact({
      type: "__no_verifier_registered__",
      category: "draft",
      projectId: 1,
      input: {},
      rendered: baseRendered,
      objectPath: "/objects/uploads/abc",
      rowPersisted: true,
      ledgerEntryId: null,
    });
    expect(result.status).toBe("failed");
    const ledgerCheck = result.checks.find((c) => c.key === "ledger-entry-created");
    expect(ledgerCheck?.pass).toBe(false);
    expect(ledgerCheck?.reason).toMatch(/Ledger entry/);
  });

  it("detects truncation via expectedCounts vs preview counts", async () => {
    const truncated: ArtifactRenderOutput = {
      ...baseRendered,
      preview: { slideCount: 3 },
      expectedCounts: { slides: 8 },
    };
    const result = await verifyArtifact({
      type: "__no_verifier_registered__",
      category: "presentation",
      projectId: 1,
      input: {},
      rendered: truncated,
      objectPath: "/objects/uploads/abc",
      rowPersisted: true,
      ledgerEntryId: 1,
    });
    const truncationCheck = result.checks.find((c) => c.key === "not-truncated");
    expect(truncationCheck?.pass).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.failureClass).toBe("content-shape");
    expect(result.retryable).toBe(true);
  });

  it("marks permanent failure classes as non-retryable", async () => {
    registerArtifactVerifier({
      type: "__permanent_fail_type__",
      async verify() {
        return [{ key: "custom-check", pass: false, reason: "Missing credentials for external service" }];
      },
    });
    const result = await verifyArtifact({
      type: "__permanent_fail_type__",
      category: "draft",
      projectId: 1,
      input: {},
      rendered: baseRendered,
      objectPath: "/objects/uploads/abc",
      rowPersisted: true,
      ledgerEntryId: 1,
    });
    expect(result.status).toBe("failed");
    expect(result.failureClass).toBe("permanent");
    expect(result.retryable).toBe(false);
  });
});
