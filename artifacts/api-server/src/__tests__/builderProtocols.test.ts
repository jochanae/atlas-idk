import { describe, expect, it } from "vitest";
import {
  detectMemoryChips,
  extractAllFileEdits,
  extractAllLinePatches,
  extractGithubPushToken,
  scrubOperationalMarkersForChat,
  canProceedWithFileChanges,
  isWriteClaimWithoutEmission,
  mergeMemoryChips,
  matchEntryChips,
  summarizeFileEdits,
  userConfirmedPendingChanges,
  isAffirmativeConfirmationReply,
  previousTurnRequestedApproval,
  convertWriteFileMarkersToFileEdits,
} from "../lib/builderProtocols";

describe("extractAllFileEdits", () => {
  it("parses a golden FILE_EDIT block", () => {
    const raw = `Building the component now.

FILE_EDIT_START
path: src/Hello.tsx
language: typescript
FILE_EDIT_CONTENT
export function Hello() {
  return <div>Hello</div>;
}
FILE_EDIT_END`;

    const { visibleContent, fileEdits } = extractAllFileEdits(raw);
    expect(visibleContent).toBe("Building the component now.");
    expect(fileEdits).toHaveLength(1);
    expect(fileEdits[0].path).toBe("src/Hello.tsx");
    expect(fileEdits[0].language).toBe("typescript");
    expect(fileEdits[0].content).toContain("export function Hello");
  });

  it("blocks forbidden paths", () => {
    const raw = `FILE_EDIT_START
path: .env
language: text
FILE_EDIT_CONTENT
SECRET=1
FILE_EDIT_END`;
    const { fileEdits } = extractAllFileEdits(raw);
    expect(fileEdits).toHaveLength(0);
  });
});

describe("extractAllLinePatches", () => {
  it("parses a golden LINE_PATCH block", () => {
    const raw = `Small fix.

LINE_PATCH_START
path: src/App.tsx
LINE_PATCH_FIND
const x = 1;
LINE_PATCH_REPLACE
const x = 2;
LINE_PATCH_END`;

    const { visibleContent, linePatches } = extractAllLinePatches(raw);
    expect(visibleContent).toBe("Small fix.");
    expect(linePatches).toEqual([
      { path: "src/App.tsx", find: "const x = 1;", replace: "const x = 2;" },
    ]);
  });
});

describe("extractGithubPushToken", () => {
  it("parses GITHUB_PUSH and strips it from content", () => {
    const raw = `Pushing now.
GITHUB_PUSH:{"branch":"atlas/hello","message":"Add hello component"}`;
    const { content, token } = extractGithubPushToken(raw);
    expect(token).toEqual({ branch: "atlas/hello", message: "Add hello component" });
    expect(content).not.toContain("GITHUB_PUSH");
  });
});

describe("detectMemoryChips", () => {
  it("parses MEMORY_CHIPS payload", () => {
    const raw = `Referencing prior decisions.
MEMORY_CHIPS:[{"label":"Use Supabase","insight":"committed","tier":1},{"label":"Ship mobile-first"}]`;
    const { content, memoryChips } = detectMemoryChips(raw);
    expect(content).toBe("Referencing prior decisions.");
    expect(memoryChips).toHaveLength(2);
    expect(memoryChips[0]).toEqual({
      label: "Use Supabase",
      insight: "committed",
      tier: 1,
    });
    expect(memoryChips[1]).toEqual({ label: "Ship mobile-first" });
  });
});

describe("scrubOperationalMarkersForChat (Output Guard)", () => {
  it("strips FILE_EDIT, GITHUB_PUSH, LINE_PATCH on CHAT turns", () => {
    const raw = `Sure, happy to chat.
FILE_EDIT_START
path: src/x.ts
language: typescript
FILE_EDIT_CONTENT
const x = 1;
FILE_EDIT_END
GITHUB_PUSH:{"branch":"atlas/x","message":"nope"}
LINE_PATCH_START
path: a.ts
LINE_PATCH_FIND
a
LINE_PATCH_REPLACE
b
LINE_PATCH_END`;
    const { content, strippedMarkers } = scrubOperationalMarkersForChat(raw);
    expect(content).toContain("Sure, happy to chat");
    expect(content).not.toContain("FILE_EDIT");
    expect(content).not.toContain("GITHUB_PUSH");
    expect(content).not.toContain("LINE_PATCH");
    expect(strippedMarkers).toEqual(
      expect.arrayContaining(["FILE_EDIT", "GITHUB_PUSH", "LINE_PATCH"]),
    );
  });
});

describe("canProceedWithFileChanges", () => {
  it("blocks edits to existing critical paths", () => {
    const allowed = canProceedWithFileChanges({
      fileEdits: [{ path: "package.json", language: "json", content: "{}" }],
      linePatches: [],
      repoFiles: new Set(["package.json"]),
    });
    expect(allowed).toBe(false);
  });

  it("allows new non-critical files", () => {
    const allowed = canProceedWithFileChanges({
      fileEdits: [{ path: "src/Hello.tsx", language: "typescript", content: "x" }],
      linePatches: [],
      repoFiles: new Set(["src/App.tsx"]),
    });
    expect(allowed).toBe(true);
  });
});

describe("confirmation loop bug fix", () => {
  const approvalMsg =
    "These changes touch files that require confirmation before applying. Reply to confirm and I'll proceed.";

  it("detects a prior assistant approval request", () => {
    const history = [
      { role: "user", content: "update package.json" },
      { role: "assistant", content: approvalMsg },
    ];
    expect(previousTurnRequestedApproval(history)).toBe(true);
  });

  it("does not flag unrelated assistant replies as approval requests", () => {
    const history = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Sure, here's the plan." },
    ];
    expect(previousTurnRequestedApproval(history)).toBe(false);
  });

  it("recognizes short explicit affirmative replies", () => {
    for (const msg of ["yes", "Yes, apply it", "go ahead", "do it", "confirmed", "ok proceed"]) {
      expect(isAffirmativeConfirmationReply(msg)).toBe(true);
    }
  });

  it("does not treat unrelated messages containing 'yes' as confirmation", () => {
    expect(isAffirmativeConfirmationReply("yes but only if it doesn't break tests")).toBe(false);
    expect(isAffirmativeConfirmationReply("can you also fix the yesterday bug")).toBe(false);
  });

  it("bypasses the gate once user confirms after an approval request (breaks the loop)", () => {
    const history = [
      { role: "user", content: "update package.json" },
      { role: "assistant", content: approvalMsg },
    ];
    expect(userConfirmedPendingChanges("yes, apply it", history)).toBe(true);
  });

  it("does not bypass the gate on a fresh message with no prior approval request", () => {
    const history = [{ role: "user", content: "hi" }, { role: "assistant", content: "Hey!" }];
    expect(userConfirmedPendingChanges("yes, apply it", history)).toBe(false);
  });

  it("does not bypass the gate when reply is not affirmative even after approval request", () => {
    const history = [
      { role: "user", content: "update package.json" },
      { role: "assistant", content: approvalMsg },
    ];
    expect(userConfirmedPendingChanges("actually, don't", history)).toBe(false);
  });
});

describe("WRITE_FILE marker bug fix", () => {
  it("converts a stray WRITE_FILE marker + preceding code fence into a real FileEdit", () => {
    const raw = `Here you go.
\`\`\`typescript
export function Hello() {
  return "hi";
}
\`\`\`
WRITE_FILE:{"path":"src/Hello.ts"}`;

    const { visibleContent, fileEdits } = convertWriteFileMarkersToFileEdits(raw);
    expect(fileEdits).toHaveLength(1);
    expect(fileEdits[0].path).toBe("src/Hello.ts");
    expect(fileEdits[0].language).toBe("typescript");
    expect(fileEdits[0].content).toContain("export function Hello");
    expect(visibleContent).not.toContain("WRITE_FILE");
    expect(visibleContent).not.toContain("```");
  });

  it("blocks WRITE_FILE markers targeting forbidden paths", () => {
    const raw = `\`\`\`text
SECRET=1
\`\`\`
WRITE_FILE:{"path":".env"}`;
    const { fileEdits } = convertWriteFileMarkersToFileEdits(raw);
    expect(fileEdits).toHaveLength(0);
  });

  it("leaves content untouched when there is no WRITE_FILE marker", () => {
    const raw = "Just a normal reply with a ```js\nconsole.log(1)\n``` code block, no marker.";
    const { visibleContent, fileEdits } = convertWriteFileMarkersToFileEdits(raw);
    expect(fileEdits).toHaveLength(0);
    expect(visibleContent).toBe(raw);
  });

  it("drops malformed WRITE_FILE JSON without throwing", () => {
    const raw = `\`\`\`ts\nconst x = 1;\n\`\`\`\nWRITE_FILE:{not valid json}`;
    expect(() => convertWriteFileMarkersToFileEdits(raw)).not.toThrow();
    const { fileEdits } = convertWriteFileMarkersToFileEdits(raw);
    expect(fileEdits).toHaveLength(0);
  });
});

describe("isWriteClaimWithoutEmission", () => {
  it("flags write claims without FILE_EDIT", () => {
    const prose =
      "I've created the file and sent it to your sandbox so you can preview the hello world component right away. ".repeat(
        2,
      );
    expect(isWriteClaimWithoutEmission(prose, false)).toBe(true);
    expect(isWriteClaimWithoutEmission(prose, true)).toBe(false);
  });
});

describe("mergeMemoryChips + matchEntryChips", () => {
  it("merges AI chips with ledger title matches", () => {
    const entries = [
      { id: 1, title: "Use Supabase Postgres", status: "committed" },
      { id: 2, title: "Ship", status: "committed" },
    ];
    const titles = matchEntryChips(
      "We should stick with Use Supabase Postgres for now.",
      entries,
    );
    expect(titles).toContain("Use Supabase Postgres");
    const merged = mergeMemoryChips([{ label: "Prior intent" }], titles);
    expect(merged.map((c) => c.label)).toEqual(["Prior intent", "Use Supabase Postgres"]);
  });
});

describe("summarizeFileEdits", () => {
  it("returns path/language/lines summaries", () => {
    const summaries = summarizeFileEdits([
      { path: "a.ts", language: "typescript", content: "a\nb\nc" },
    ]);
    expect(summaries).toEqual([{ path: "a.ts", language: "typescript", lines: 3 }]);
  });
});

/**
 * Done-event field-name contract — BUILD vs CHAT/DECIDE gating.
 * Mirrors what nexus finishStream attaches to the done payload.
 */
describe("done-event builder field gating contract", () => {
  function buildDoneFields(args: {
    intent: "BUILD" | "CHAT" | "DECIDE";
    allowBuildSideEffects: boolean;
    raw: string;
  }) {
    let content = args.raw;
    if (args.intent === "CHAT") {
      content = scrubOperationalMarkersForChat(content).content;
    }
    const { content: afterPush, token } = extractGithubPushToken(content);
    // MEMORY_CHIPS before FILE_EDIT stripping (chips are trailing)
    const { content: afterChips, memoryChips } = detectMemoryChips(afterPush);
    const { visibleContent: afterPatches, linePatches } = extractAllLinePatches(afterChips);
    const { visibleContent: afterEdits, fileEdits } = extractAllFileEdits(afterPatches);

    const responseFileEdits = args.allowBuildSideEffects ? fileEdits : [];
    const responseLinePatches = args.allowBuildSideEffects ? linePatches : [];
    const githubPush =
      args.allowBuildSideEffects && token
        ? { commitSha: "abc123", ledgerEntryId: "1" }
        : null;

    return {
      content: afterEdits,
      memoryChips: memoryChips.length > 0 ? memoryChips : undefined,
      fileEdits: responseFileEdits.length > 0 ? responseFileEdits : undefined,
      linePatches: responseLinePatches.length > 0 ? responseLinePatches : undefined,
      githubPush,
      githubPushResult:
        args.allowBuildSideEffects && token
          ? { branch: token.branch, message: token.message, files: [] }
          : undefined,
    };
  }

  const goldenBuild = `Writing hello world.
FILE_EDIT_START
path: src/Hello.tsx
language: typescript
FILE_EDIT_CONTENT
export const Hello = () => <h1>Hi</h1>;
FILE_EDIT_END
GITHUB_PUSH:{"branch":"atlas/hello","message":"Add Hello"}
MEMORY_CHIPS:[{"label":"Use Supabase Postgres"}]
LINE_PATCH_START
path: src/App.tsx
LINE_PATCH_FIND
const x = 1;
LINE_PATCH_REPLACE
const x = 2;
LINE_PATCH_END`;

  it("BUILD: emits fileEdits, linePatches, githubPush, memoryChips", () => {
    const done = buildDoneFields({
      intent: "BUILD",
      allowBuildSideEffects: true,
      raw: goldenBuild,
    });
    expect(done.fileEdits?.length).toBe(1);
    expect(done.linePatches?.length).toBe(1);
    expect(done.githubPush).toEqual({ commitSha: "abc123", ledgerEntryId: "1" });
    expect(done.githubPushResult?.branch).toBe("atlas/hello");
    expect(done.memoryChips?.[0].label).toBe("Use Supabase Postgres");
    expect(done.content).not.toContain("FILE_EDIT");
    expect(done.content).not.toContain("MEMORY_CHIPS");
  });

  it("CHAT: strips builder tokens; memoryChips still allowed if present after scrub", () => {
    const done = buildDoneFields({
      intent: "CHAT",
      allowBuildSideEffects: false,
      raw: `Just chatting.
MEMORY_CHIPS:[{"label":"Prior intent"}]
FILE_EDIT_START
path: src/x.ts
language: typescript
FILE_EDIT_CONTENT
x
FILE_EDIT_END
GITHUB_PUSH:{"branch":"atlas/x","message":"no"}`,
    });
    expect(done.fileEdits).toBeUndefined();
    expect(done.linePatches).toBeUndefined();
    expect(done.githubPush).toBeNull();
    expect(done.githubPushResult).toBeUndefined();
    // MEMORY_CHIPS survives CHAT scrub (not an operational write marker)
    expect(done.memoryChips?.[0].label).toBe("Prior intent");
  });

  it("DECIDE: no fileEdits/githubPush; memoryChips still emits", () => {
    const done = buildDoneFields({
      intent: "DECIDE",
      allowBuildSideEffects: false,
      raw: `Here are the options.
MEMORY_CHIPS:[{"label":"Committed direction"}]
FILE_EDIT_START
path: src/x.ts
language: typescript
FILE_EDIT_CONTENT
x
FILE_EDIT_END`,
    });
    expect(done.fileEdits).toBeUndefined();
    expect(done.githubPush).toBeNull();
    expect(done.memoryChips?.[0].label).toBe("Committed direction");
  });
});
