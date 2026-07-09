import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
  },
  entriesTable: { id: "id" },
  projectArtifactsTable: {
    id: "id",
    projectId: "project_id",
    type: "type",
    version: "version",
  },
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectStorageService {
    async getObjectEntityUploadURL() {
      return "https://storage.example/upload/abc123";
    }
    normalizeObjectEntityPath(uploadURL: string) {
      return "/objects/uploads/abc123";
    }
    async getObjectEntityFile(objectPath: string) {
      return { objectPath } as never;
    }
    async downloadObject() {
      return new Response(new Blob([Buffer.from("file-bytes")]), { status: 200 });
    }
  }
  class ObjectNotFoundError extends Error {}
  return { ObjectStorageService, ObjectNotFoundError };
});

import { db } from "@workspace/db";
import {
  registerArtifactRenderer,
  generateArtifact,
  getFileBackedArtifact,
  getArtifactRenderer,
  listArtifactRendererTypes,
  type ArtifactRenderOutput,
} from "../lib/artifactEngine";

const mockTransaction = vi.mocked(db.transaction);
const mockInsert = vi.mocked(db.insert);

function mockTransactionOnce(row: Record<string, unknown>) {
  mockTransaction.mockImplementationOnce(async (cb: any) => {
    const tx = {
      select: () => ({
        from: () => ({
          where: async () => [{ maxV: row.__priorVersion ?? 0 }],
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [row],
        }),
      }),
    };
    return cb(tx);
  });
}

function mockLedgerInsertOnce(entry: { id: number } | null) {
  mockInsert.mockReturnValueOnce({
    values: () => ({
      returning: async () => (entry ? [entry] : []),
    }),
  } as never);
}

describe("Artifact Engine — generateArtifact contract", () => {
  const testRenderOutput: ArtifactRenderOutput = {
    buffer: Buffer.from("hello world"),
    title: "Test Artifact",
    mimeType: "text/plain",
    extension: "txt",
    preview: { note: "preview payload" },
    summary: "A test artifact.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    registerArtifactRenderer({
      type: "__test_type__",
      category: "draft",
      render: vi.fn().mockResolvedValue(testRenderOutput),
    });
  });

  it("registers and lists renderer types", () => {
    expect(listArtifactRendererTypes()).toContain("__test_type__");
    expect(getArtifactRenderer("__test_type__")).toBeDefined();
  });

  it("throws a clear error for an unregistered renderer type", async () => {
    await expect(
      generateArtifact({ projectId: 1, type: "__does_not_exist__", input: {} }),
    ).rejects.toThrow(/no renderer registered for type/);
  });

  it("runs render → upload → persist → ledger-link and returns the full contract", async () => {
    mockTransactionOnce({
      id: 501,
      projectId: 1,
      type: "__test_type__",
      version: 1,
      title: "Test Artifact",
      metadata: { objectPath: "/objects/uploads/abc123" },
      payload: { preview: testRenderOutput.preview },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mockLedgerInsertOnce({ id: 900 });

    const result = await generateArtifact({ projectId: 1, type: "__test_type__", input: {} });

    expect(result.id).toBe(501);
    expect(result.type).toBe("__test_type__");
    expect(result.category).toBe("draft");
    expect(result.version).toBe(1);
    expect(result.mimeType).toBe("text/plain");
    expect(result.extension).toBe("txt");
    expect(result.sizeBytes).toBe(testRenderOutput.buffer.byteLength);
    expect(result.preview).toEqual(testRenderOutput.preview);
    expect(result.objectPath).toBe("/objects/uploads/abc123");
    expect(result.ledgerEntryId).toBe(900);
  });

  it("still returns the artifact when the Ledger insert fails (non-fatal)", async () => {
    mockTransactionOnce({
      id: 502,
      projectId: 1,
      type: "__test_type__",
      version: 2,
      title: "Test Artifact",
      metadata: { objectPath: "/objects/uploads/abc123" },
      payload: { preview: testRenderOutput.preview },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    mockInsert.mockImplementationOnce(() => {
      throw new Error("ledger table unavailable");
    });

    const result = await generateArtifact({ projectId: 1, type: "__test_type__", input: {} });
    expect(result.id).toBe(502);
    expect(result.ledgerEntryId).toBeNull();
  });

  it("retries version insertion once on a unique-constraint race, then succeeds", async () => {
    let attempt = 0;
    mockTransaction.mockImplementation(async (cb: any) => {
      attempt++;
      const tx = {
        select: () => ({
          from: () => ({
            where: async () => [{ maxV: 0 }],
          }),
        }),
        insert: () => ({
          values: () => ({
            returning: async () => {
              if (attempt === 1) {
                throw new Error('duplicate key value violates unique constraint "project_artifacts_version_uniq"');
              }
              return [
                {
                  id: 503,
                  projectId: 1,
                  type: "__test_type__",
                  version: 1,
                  title: "Test Artifact",
                  metadata: { objectPath: "/objects/uploads/abc123" },
                  payload: { preview: testRenderOutput.preview },
                  createdAt: new Date("2026-01-01T00:00:00.000Z"),
                },
              ];
            },
          }),
        }),
      };
      return cb(tx);
    });
    mockLedgerInsertOnce({ id: 901 });

    const result = await generateArtifact({ projectId: 1, type: "__test_type__", input: {} });
    expect(attempt).toBe(2);
    expect(result.id).toBe(503);
  });
});

describe("Artifact Engine — getFileBackedArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the row does not exist", async () => {
    // db.select is not mocked in this suite's module mock — patch it in.
    (db as any).select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    });
    const result = await getFileBackedArtifact(1, 999);
    expect(result).toBeNull();
  });

  it("returns null for a row with no metadata.objectPath (e.g. a legacy JSON-only artifact)", async () => {
    (db as any).select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            { id: 5, projectId: 1, type: "tradeoff_matrix", metadata: {}, payload: {} },
          ],
        }),
      }),
    });
    const result = await getFileBackedArtifact(1, 5);
    expect(result).toBeNull();
  });

  it("returns objectPath/mimeType/extension for a file-backed row", async () => {
    (db as any).select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: 6,
              projectId: 1,
              type: "docx",
              metadata: {
                objectPath: "/objects/uploads/xyz",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                extension: "docx",
              },
              payload: {},
            },
          ],
        }),
      }),
    });
    const result = await getFileBackedArtifact(1, 6);
    expect(result?.objectPath).toBe("/objects/uploads/xyz");
    expect(result?.extension).toBe("docx");
  });
});
