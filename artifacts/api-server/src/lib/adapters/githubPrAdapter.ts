// GitHub PR delivery adapter — opens a pull request from a draft_pr artifact's
// title/body against an existing head branch. Reuses the same GitHub REST
// call the rest of the app already uses for PR creation (see routes/github.ts)
// so behavior/token handling stays consistent — this adapter does not manage
// its own GitHub auth, the route layer resolves a token and passes it in via
// `context.auth.githubToken`.
import { registerDeliveryAdapter, type DeliveryAdapter } from "../deliveryEngine";

const GH_API = "https://api.github.com";

const githubPrAdapter: DeliveryAdapter = {
  provider: "github_pr",
  label: "Open Pull Request",
  validateTarget(target) {
    const repo = typeof target.repo === "string" ? target.repo.trim() : "";
    const head = typeof target.head === "string" ? target.head.trim() : "";
    const base = typeof target.base === "string" && target.base.trim() ? target.base.trim() : "main";
    if (!repo || !repo.includes("/")) {
      throw new Error("A GitHub repo in \"owner/repo\" form is required");
    }
    if (!head) {
      throw new Error("A head branch to open the PR from is required");
    }
    return { repo, head, base };
  },
  async send(target, context) {
    const token = context.auth?.githubToken as string | undefined;
    if (!token) {
      throw new Error("GitHub delivery requires a connected GitHub account");
    }

    const body = typeof context.preview.body === "string" ? context.preview.body : "";
    const prResp = await fetch(`${GH_API}/repos/${target.repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Atlas-Dev-Env/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: context.title, body, head: target.head, base: target.base }),
    });

    if (!prResp.ok) {
      const detail = await prResp.text();
      throw new Error(`GitHub API error (${prResp.status}): ${detail}`);
    }

    const pr = (await prResp.json()) as { html_url: string; number: number };
    return { externalRef: { prUrl: pr.html_url, prNumber: pr.number } };
  },
};

registerDeliveryAdapter(githubPrAdapter);
