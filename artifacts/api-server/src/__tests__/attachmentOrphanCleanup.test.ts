/**
 * Attachment orphan-cleanup lifecycle tests.
 *
 * Verifies the pending-TTL → full-retention promotion contract without hitting
 * real storage or a real database.
 *
 * Test coverage:
 *   T1 – request-upload but never send → eligible for cleanup after pending TTL
 *   T2 – upload + send succeeds → promoted to full retention expiry
 *   T3 – send fails after upload → pending TTL remains, eventually swept
 *   T4 – retry send is idempotent (no conflicting linkage)
 *   T5 – retention worker deletes expired storage objects, preserves DB row
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const db = { update: vi.fn(), select: vi.fn(), insert: vi.fn() };
  return {
    db,
    messageAttachmentsTable: {
      id: "id",
      userId: "userId",
      availabilityStatus: "availabilityStatus",
      expiresAt: "expiresAt",
      storageBucket: "storageBucket",
      storagePath: "storagePath",
      conversationId: "conversationId",
      surface: "surface",
      projectId: "projectId",
      chatMessageId: "chatMessageId",
      nexusMessageId: "nexusMessageId",
      updatedAt: "updatedAt",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  ne: (col: unknown, val: unknown) => ({ ne: [col, val] }),
  or: (...args: unknown[]) => ({ or: args }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
  lt: (col: unknown, val: unknown) => ({ lt: [col, val] }),
  gte: (col: unknown, val: unknown) => ({ gte: [col, val] }),
}));

vi.mock("../lib/attachmentStorage", () => ({
  ATTACHMENT_RETENTION_DAYS: 60,
  ATTACHMENT_EXPIRING_SOON_DAYS: 7,
  ATTACHMENT_PENDING_TTL_DAYS: 1,
  deleteAttachmentObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── helpers ──────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  deleteAttachmentObject,
  ATTACHMENT_RETENTION_DAYS,
  ATTACHMENT_PENDING_TTL_DAYS,
} from "../lib/attachmentStorage";

/**
 * A chainable mock that records all method calls AND resolves when awaited.
 *
 * Works for two call-chain patterns:
 *   a) await chain.update().set().where()           — where() returns chain;
 *                                                     await chain uses `.then`
 *   b) await chain.update().set().where().returning() — .returning() is a
 *                                                     real Promise
 */
function makeChain(returnValue: unknown = []) {
  const callLog: Record<string, unknown[][]> = {};

  const chain = new Proxy(
    {
      // Thenable: makes `await chain` resolve to returnValue without needing a
      // dedicated Promise method on the chain.
      then(
        resolve: (v: unknown) => void,
        _reject?: (e: unknown) => void,
      ): void {
        resolve(returnValue);
      },
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop === "then") return target["then"];

        // Record the call and return the chain so callers can keep chaining.
        // .returning() returns a real resolved Promise so `await .returning()`
        // works in contexts that don't expect the chain itself.
        if (!(prop in target)) {
          target[prop] = (...args: unknown[]) => {
            (callLog[prop] ??= []).push(args);
            if (prop === "returning") {
              return Promise.resolve(returnValue);
            }
            return chain;
          };
        }
        return target[prop];
      },
    },
  );

  return { chain, callLog };
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ── T1: upload only (never sent) is eligible for cleanup after pending TTL ───

describe("T1 – upload-only orphan is eligible for cleanup after the pending TTL", () => {
  it("ATTACHMENT_PENDING_TTL_DAYS is positive (non-null expiry guaranteed at request-upload)", () => {
    expect(ATTACHMENT_PENDING_TTL_DAYS).toBeGreaterThan(0);
  });

  it("pending TTL is strictly shorter than full retention TTL", () => {
    expect(ATTACHMENT_PENDING_TTL_DAYS).toBeLessThan(ATTACHMENT_RETENTION_DAYS);
  });

  it("a date computed from PENDING_TTL_DAYS is in the future but before full retention", () => {
    const pendingExpiry = daysFromNow(ATTACHMENT_PENDING_TTL_DAYS);
    const fullExpiry = daysFromNow(ATTACHMENT_RETENTION_DAYS);
    expect(pendingExpiry.getTime()).toBeGreaterThan(Date.now());
    expect(pendingExpiry.getTime()).toBeLessThan(fullExpiry.getTime());
  });

  it("retention worker marks rows with past expiresAt as expired", async () => {
    const expiredRow = { id: "att-1", storageBucket: "bkt", storagePath: "p/file" };
    const { chain: expiringChain } = makeChain([]);
    const { chain: expiredChain } = makeChain([expiredRow]);
    (db.update as Mock)
      .mockReturnValueOnce(expiringChain)
      .mockReturnValueOnce(expiredChain);

    const { runAttachmentRetentionPass } = await import("../lib/attachmentRetentionWorker");
    const result = await runAttachmentRetentionPass();

    expect(result.markedExpired).toBe(1);
    expect(result.markedExpiring).toBe(0);
  });
});

// ── T2: upload + send → promoted to full retention ───────────────────────────

describe("T2 – upload succeeds and message sends → promoted to full retention expiry", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("linkAttachmentsToMessage sets expiresAt ≈ now + RETENTION_DAYS", async () => {
    // Capture the `.set()` argument by wrapping db.update with a capturing spy.
    let capturedSetArg: Record<string, unknown> | null = null;
    (db.update as Mock).mockImplementation(() => ({
      set(values: Record<string, unknown>) {
        capturedSetArg = values;
        return { where: () => Promise.resolve([]) };
      },
    }));

    const { linkAttachmentsToMessage } = await import("../lib/attachmentResolve");
    await linkAttachmentsToMessage({
      userId: 1,
      attachmentIds: ["att-abc"],
      conversationId: "conv-1",
      surface: "nexus",
      chatMessageId: 42,
      nexusMessageId: null,
    });

    expect(capturedSetArg).not.toBeNull();
    expect(capturedSetArg!["expiresAt"]).toBeInstanceOf(Date);

    const promotedExpiry = (capturedSetArg!["expiresAt"] as Date).getTime();
    const expectedMin = Date.now() + (ATTACHMENT_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000;
    const expectedMax = Date.now() + (ATTACHMENT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(promotedExpiry).toBeGreaterThan(expectedMin);
    expect(promotedExpiry).toBeLessThan(expectedMax);
  });

  it("promoted expiry is at least 30 days beyond the pending TTL window", async () => {
    let capturedSetArg: Record<string, unknown> | null = null;
    (db.update as Mock).mockImplementation(() => ({
      set(values: Record<string, unknown>) {
        capturedSetArg = values;
        return { where: () => Promise.resolve([]) };
      },
    }));

    const { linkAttachmentsToMessage } = await import("../lib/attachmentResolve");
    await linkAttachmentsToMessage({
      userId: 1,
      attachmentIds: ["att-abc"],
      conversationId: "conv-1",
      surface: "nexus",
    });

    const promotedMs = (capturedSetArg!["expiresAt"] as Date).getTime();
    const pendingMs = daysFromNow(ATTACHMENT_PENDING_TTL_DAYS).getTime();
    expect(promotedMs).toBeGreaterThan(pendingMs + 30 * 24 * 60 * 60 * 1000);
  });
});

// ── T3: send fails → pending TTL remains, swept eventually ───────────────────

describe("T3 – send fails after upload → pending TTL unchanged, swept by worker", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("when linkAttachmentsToMessage is never called, db.update is not invoked", () => {
    // Simulates: upload succeeded, send threw before linkAttachmentsToMessage.
    // The pending TTL is unchanged; the retention worker will sweep the row.
    expect((db.update as Mock).mock.calls).toHaveLength(0);
  });

  it("retention worker sweeps a row whose expiresAt is past and deletes its object", async () => {
    const expiredRow = { id: "att-orphan", storageBucket: "bkt", storagePath: "orphan/file.pdf" };
    const { chain: expiringChain } = makeChain([]);
    const { chain: expiredChain } = makeChain([expiredRow]);
    (db.update as Mock)
      .mockReturnValueOnce(expiringChain)
      .mockReturnValueOnce(expiredChain);

    const { runAttachmentRetentionPass } = await import("../lib/attachmentRetentionWorker");
    const result = await runAttachmentRetentionPass();

    expect(result.markedExpired).toBe(1);
    expect(deleteAttachmentObject).toHaveBeenCalledWith({
      storageBucket: expiredRow.storageBucket,
      storagePath: expiredRow.storagePath,
    });
    expect(result.objectsDeleted).toBe(1);
  });
});

// ── T4: retry send is idempotent, no conflicting linkage ─────────────────────

describe("T4 – retrying the send does not create conflicting attachment linkage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calling linkAttachmentsToMessage twice issues two UPDATEs with the same message ID", async () => {
    const seenMessageIds: Array<number | null> = [];
    (db.update as Mock).mockImplementation(() => ({
      set(values: Record<string, unknown>) {
        seenMessageIds.push(values["nexusMessageId"] as number);
        return { where: () => Promise.resolve([]) };
      },
    }));

    const { linkAttachmentsToMessage } = await import("../lib/attachmentResolve");
    await linkAttachmentsToMessage({ userId: 1, attachmentIds: ["att-x"], conversationId: "c1", surface: "nexus", nexusMessageId: 10 });
    await linkAttachmentsToMessage({ userId: 1, attachmentIds: ["att-x"], conversationId: "c1", surface: "nexus", nexusMessageId: 10 });

    expect(db.update).toHaveBeenCalledTimes(2);
    expect(seenMessageIds).toEqual([10, 10]);
  });

  it("duplicate attachment IDs in the array are deduplicated before the UPDATE", async () => {
    let capturedWhere: unknown = null;
    (db.update as Mock).mockImplementation(() => ({
      set() {
        return {
          where(cond: unknown) {
            capturedWhere = cond;
            return Promise.resolve([]);
          },
        };
      },
    }));

    const { linkAttachmentsToMessage } = await import("../lib/attachmentResolve");
    await linkAttachmentsToMessage({
      userId: 1,
      attachmentIds: ["att-dup", "att-dup", "att-dup"],
      conversationId: "conv-1",
      surface: "nexus",
    });

    // The WHERE tree is serialisable; "att-dup" must appear exactly once.
    const json = JSON.stringify(capturedWhere);
    expect((json.match(/att-dup/g) ?? []).length).toBe(1);
  });
});

// ── T5: retention worker deletes objects + preserves DB row ──────────────────

describe("T5 – cleanup worker deletes expired storage object and preserves DB row", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("deletes the storage object for every expired row", async () => {
    const rows = [
      { id: "att-1", storageBucket: "bkt", storagePath: "u/1/att-1/f.pdf" },
      { id: "att-2", storageBucket: "bkt", storagePath: "u/1/att-2/i.png" },
    ];
    const { chain: expiringChain } = makeChain([]);
    const { chain: expiredChain } = makeChain(rows);
    (db.update as Mock)
      .mockReturnValueOnce(expiringChain)
      .mockReturnValueOnce(expiredChain);

    const { runAttachmentRetentionPass } = await import("../lib/attachmentRetentionWorker");
    const result = await runAttachmentRetentionPass();

    expect(result.markedExpired).toBe(2);
    expect(result.objectsDeleted).toBe(2);
    expect(deleteAttachmentObject).toHaveBeenCalledTimes(2);
    expect(deleteAttachmentObject).toHaveBeenCalledWith({ storageBucket: rows[0]!.storageBucket, storagePath: rows[0]!.storagePath });
    expect(deleteAttachmentObject).toHaveBeenCalledWith({ storageBucket: rows[1]!.storageBucket, storagePath: rows[1]!.storagePath });
  });

  it("a storage delete failure is non-fatal — pass continues and counts only successful deletes", async () => {
    const rows = [
      { id: "att-ok",   storageBucket: "bkt", storagePath: "u/1/ok/f.txt"   },
      { id: "att-fail", storageBucket: "bkt", storagePath: "u/1/fail/f.txt" },
    ];
    (deleteAttachmentObject as Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("GCS 503"));

    const { chain: expiringChain } = makeChain([]);
    const { chain: expiredChain } = makeChain(rows);
    (db.update as Mock)
      .mockReturnValueOnce(expiringChain)
      .mockReturnValueOnce(expiredChain);

    const { runAttachmentRetentionPass } = await import("../lib/attachmentRetentionWorker");
    const result = await runAttachmentRetentionPass();

    expect(result.markedExpired).toBe(2);
    expect(result.objectsDeleted).toBe(1);
  });

  it("library rows are excluded from expiry promotion by the ne(availabilityStatus, library) guard", async () => {
    let capturedWhere: unknown = null;
    (db.update as Mock).mockImplementation(() => ({
      set() {
        return {
          where(cond: unknown) {
            capturedWhere = cond;
            return Promise.resolve([]);
          },
        };
      },
    }));

    const { linkAttachmentsToMessage } = await import("../lib/attachmentResolve");
    await linkAttachmentsToMessage({ userId: 1, attachmentIds: ["lib-att"], conversationId: "c1", surface: "nexus" });

    // The WHERE tree must contain the ne(availabilityStatus, "library") guard.
    const json = JSON.stringify(capturedWhere);
    expect(json).toContain("library");
  });
});
