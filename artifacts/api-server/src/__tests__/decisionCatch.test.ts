import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildCatchChecks,
  detectDecisionCatch,
  extractIntentSummary,
  hasConflictSignal,
  truncate,
} from "../lib/decisionCatch";
import { isSummaryObservation, wouldEmitCommitCard } from "../lib/decisionSignals";

vi.mock("../lib/embeddings", () => ({
  embedText: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
  entriesTable: {
    id: "id",
    title: "title",
    catchAgainstId: "catch_against_id",
    projectId: "project_id",
    status: "status",
    deviation: "deviation",
    verb: "verb",
  },
}));

import { embedText } from "../lib/embeddings";
import { db } from "@workspace/db";

const mockEmbedText = vi.mocked(embedText);
const mockExecute = vi.mocked(db.execute);

function mockSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
}

describe("hasConflictSignal", () => {
  it("detects switch language relative to entry title", () => {
    expect(hasConflictSignal("let's move to Neon instead", "Use Supabase Postgres")).toBe(true);
  });

  it("returns false for alignment-only phrasing", () => {
    expect(hasConflictSignal("let's polish the mobile view", "Ship mobile-first")).toBe(false);
  });
});

describe("buildCatchChecks", () => {
  const hits = [
    {
      id: 1,
      title: "Use Supabase Postgres",
      summary: null,
      verb: null,
      deviation: false,
      catchAgainstId: null,
      sessionId: 10,
      score: 0.85,
    },
    {
      id: 2,
      title: "Ship mobile-first",
      summary: null,
      verb: null,
      deviation: false,
      catchAgainstId: null,
      sessionId: 11,
      score: 0.8,
    },
  ];

  it("orders conflicts first and caps at three checks", () => {
    const checks = buildCatchChecks(
      hits,
      "let's switch to Neon instead of Supabase",
      [{ id: 99, title: "Overrode: Use Supabase Postgres", catchAgainstId: 1 }],
    );
    expect(checks[0]?.kind).toBe("conflict");
    expect(checks.some((c) => c.kind === "pattern")).toBe(true);
    expect(checks.length).toBeLessThanOrEqual(3);
  });

  it("returns alignment only when no conflict verbs", () => {
    const checks = buildCatchChecks(hits, "let's polish the mobile view", []);
    expect(checks.every((c) => c.kind === "alignment")).toBe(true);
  });
});

describe("decisionSignals", () => {
  it("suppresses summary observations", () => {
    expect(isSummaryObservation("From what I can see, the project is in good shape.")).toBe(true);
  });

  it("detects commit-card moments", () => {
    const assistant =
      "Based on everything we've discussed, the approach is clear. We'll use Postgres for auth with row-level security from day one. This gives us the flexibility we need while keeping the data model simple enough to iterate on quickly.";
    expect(wouldEmitCommitCard(assistant, "let's lock this in")).toBe(true);
  });
});

describe("detectDecisionCatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSelectChain([]);
  });

  it("returns null for think intent even with overlap", async () => {
    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's move to Neon",
      assistantText: "Switching databases now.",
      intent: "CHAT",
      confidence: 0.9,
    });
    expect(result).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns null when no committed entries match", async () => {
    mockExecute.mockResolvedValue({ rows: [] } as never);
    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's move to Neon",
      assistantText: "Switching to Neon.",
      intent: "BUILD",
      confidence: 0.8,
    });
    expect(result).toBeNull();
  });

  it("emits catch for conflict against committed entry", async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 42,
          title: "Use Supabase Postgres",
          summary: null,
          verb: null,
          deviation: false,
          catch_against_id: null,
          session_id: 99,
          score: 0.88,
        },
      ],
    } as never);

    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's move to Neon",
      assistantText: "We'll switch to Neon instead of Supabase for auth.",
      intent: "DECIDE",
      confidence: 0.85,
      sessionId: 5,
    });

    expect(result).not.toBeNull();
    expect(result?.primaryConflictEntryId).toBe(42);
    expect(result?.checks.some((c) => c.kind === "conflict")).toBe(true);
    expect(result?.deviationTitle).toContain("Overrode:");
  });

  it("returns null for alignment-only overlap", async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 7,
          title: "Ship mobile-first",
          summary: null,
          verb: null,
          deviation: false,
          catch_against_id: null,
          session_id: 99,
          score: 0.9,
        },
      ],
    } as never);

    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's polish the mobile view",
      assistantText: "We can refine the mobile layout and tighten spacing.",
      intent: "BUILD",
      confidence: 0.8,
    });
    expect(result).toBeNull();
  });

  it("suppresses when primary conflict was committed in the same session", async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 42,
          title: "Use Supabase Postgres",
          summary: null,
          verb: null,
          deviation: false,
          catch_against_id: null,
          session_id: 5,
          score: 0.88,
        },
      ],
    } as never);

    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's move to Neon",
      assistantText: "We'll switch to Neon instead.",
      intent: "BUILD",
      confidence: 0.8,
      sessionId: 5,
    });
    expect(result).toBeNull();
  });

  it("includes pattern check for prior deviation", async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 42,
          title: "Use Supabase Postgres",
          summary: null,
          verb: null,
          deviation: false,
          catch_against_id: null,
          session_id: 99,
          score: 0.88,
        },
      ],
    } as never);
    mockSelectChain([
      { id: 100, title: "Overrode: Use Supabase Postgres", catchAgainstId: 42 },
    ]);

    const result = await detectDecisionCatch({
      projectId: 1,
      userId: 1,
      userText: "let's move to Neon",
      assistantText: "We'll switch to Neon instead of Supabase.",
      intent: "BUILD",
      confidence: 0.8,
      sessionId: 5,
    });

    expect(result?.checks.some((c) => c.kind === "pattern")).toBe(true);
  });
});

describe("extractIntentSummary", () => {
  it("prefers assistant restatement", () => {
    expect(
      extractIntentSummary(
        "let's move to Neon",
        "We're switching to Neon for the auth database. It should simplify local dev.",
      ),
    ).toContain("switching");
  });

  it("falls back to user text", () => {
    expect(extractIntentSummary("let's move to Neon", "Sounds good.")).toContain("Neon");
  });
});

describe("truncate", () => {
  it("truncates long titles", () => {
    const long = "a".repeat(200);
    expect(truncate(long, 140).length).toBeLessThanOrEqual(140);
  });
});
