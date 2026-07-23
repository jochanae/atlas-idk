// Trust layer for LINE_PATCH application.
//
// Mirrors the protections that GitHubPushModal applies before commit:
//   1. Typecheck each TS/JS file after patches are applied.
//   2. Partial-guard: flag patched content that dramatically shrinks the file
//      (likely a stub / accidental truncation from a bad anchor).
//
// Both checks fall through on transient errors (network / service down) so a
// missing typecheck service never blocks a valid patch — matching the modal's
// existing behavior.

export type TrustError = {
  kind: "typecheck" | "partial";
  path: string;
  message: string;
};

export type TrustCheckInput = {
  path: string;
  patched: string;
  original: string;
};

const TC_EXTS = new Set(["ts", "tsx", "js", "jsx"]);
const PARTIAL_MIN_ORIGINAL_LINES = 50;
const PARTIAL_SHRINK_RATIO = 0.4;

export async function runLinePatchTrustChecks(
  inputs: TrustCheckInput[],
): Promise<TrustError[]> {
  const errors: TrustError[] = [];

  // Partial-guard: synchronous, cheap.
  for (const { path, patched, original } of inputs) {
    const origLines = original.split("\n").length;
    const newLines = patched.split("\n").length;
    if (
      origLines >= PARTIAL_MIN_ORIGINAL_LINES &&
      newLines < origLines * PARTIAL_SHRINK_RATIO
    ) {
      const name = path.split("/").pop() ?? path;
      errors.push({
        kind: "partial",
        path,
        message: `Patched ${name} is ${newLines}L vs original ${origLines}L — anchor may have swallowed too much. Ask Joy to re-read the file.`,
      });
    }
  }

  // Typecheck in parallel.
  const tcResults = await Promise.all(
    inputs.map(async ({ path, patched }) => {
      const ext = (path ?? "").split(".").pop()?.toLowerCase() ?? "";
      if (!TC_EXTS.has(ext)) return null;
      try {
        const r = await fetch("/api/github/typecheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: patched, path }),
        });
        if (!r.ok) return null;
        const data = (await r.json()) as {
          errors?: Array<{ line: number; col: number; message: string }>;
          clean?: boolean;
          skipped?: boolean;
        };
        const isClean = data.skipped === true || (data.clean ?? true);
        if (isClean) return null;
        const first = (data.errors ?? []).slice(0, 3)
          .map((e) => `L${e.line}: ${e.message}`)
          .join(" · ");
        const name = path.split("/").pop() ?? path;
        return {
          kind: "typecheck" as const,
          path,
          message: `Typecheck failed in ${name}${first ? `: ${first}` : ""}`,
        };
      } catch {
        return null; // service unavailable → allow
      }
    }),
  );
  for (const r of tcResults) if (r) errors.push(r);
  return errors;
}

export function formatTrustErrors(errors: TrustError[]): string {
  if (errors.length === 1) return errors[0].message;
  return `${errors.length} issues — ${errors.map((e) => e.message).join(" | ")}`;
}
