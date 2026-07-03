export type GithubPushPayload = {
  sha: string;
  url: string;
  repo?: string;
  branch?: string;
};

const GITHUB_PUSH_MARKER_RE = /(?:^|\n)GITHUB_PUSH:\s*(\{[^\n]+\})\s*$/;

function isGithubPushPayload(value: unknown): value is GithubPushPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<GithubPushPayload>;
  return typeof payload.sha === "string" && payload.sha.trim().length > 0 &&
    typeof payload.url === "string" && payload.url.trim().length > 0;
}

export function appendGithubPushReceiptMarker(content: string, payload: GithubPushPayload): string {
  return `${content.trim()}\n\nGITHUB_PUSH:${JSON.stringify(payload)}`;
}

export function parseGithubPushReceipt(content?: string | null): GithubPushPayload | null {
  if (!content) return null;
  const match = content.match(GITHUB_PUSH_MARKER_RE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return isGithubPushPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stripGithubPushReceiptMarker(content?: string | null): string {
  return (content ?? "").replace(GITHUB_PUSH_MARKER_RE, "").trim();
}