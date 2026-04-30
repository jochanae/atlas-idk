import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GITHUB_API = "https://api.github.com";
const GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN = "https://github.com/login/oauth/access_token";

async function ghFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Validate a PAT and return user info */
export const validateGitHubToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(500) }).parse)
  .handler(async ({ data }) => {
    const user = await ghFetch("/user", data.token);
    return {
      login: user.login as string,
      avatar_url: user.avatar_url as string,
      name: (user.name ?? user.login) as string,
    };
  });

/** Get repo info */
export const getRepoInfo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1), owner: z.string().min(1).max(100), repo: z.string().min(1).max(200) }).parse)
  .handler(async ({ data }) => {
    const repo = await ghFetch(`/repos/${data.owner}/${data.repo}`, data.token);
    return {
      full_name: repo.full_name as string,
      default_branch: repo.default_branch as string,
      private: repo.private as boolean,
      html_url: repo.html_url as string,
    };
  });

/** List branches */
export const listBranches = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1), owner: z.string().min(1), repo: z.string().min(1) }).parse)
  .handler(async ({ data }) => {
    const branches = await ghFetch(`/repos/${data.owner}/${data.repo}/branches?per_page=30`, data.token);
    return (branches as Array<{ name: string }>).map((b) => b.name);
  });

/** Get file content from repo (or null if not found) */
export const getFileContent = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    token: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
    path: z.string().min(1).max(500),
    branch: z.string().min(1),
  }).parse)
  .handler(async ({ data }) => {
    try {
      const file = await ghFetch(
        `/repos/${data.owner}/${data.repo}/contents/${data.path}?ref=${data.branch}`,
        data.token,
      );
      const content = file.encoding === "base64"
        ? atob(file.content.replace(/\n/g, ""))
        : file.content;
      return { content: content as string, sha: file.sha as string };
    } catch {
      return null;
    }
  });

/** Push a file (create or update) */
export const pushFile = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    token: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
    path: z.string().min(1).max(500),
    content: z.string(),
    message: z.string().min(1).max(500),
    branch: z.string().min(1),
    sha: z.string().optional(),
  }).parse)
  .handler(async ({ data }) => {
    const body: Record<string, unknown> = {
      message: data.message,
      content: btoa(unescape(encodeURIComponent(data.content))),
      branch: data.branch,
    };
    if (data.sha) body.sha = data.sha;

    const result = await ghFetch(
      `/repos/${data.owner}/${data.repo}/contents/${data.path}`,
      data.token,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return { sha: result.content?.sha as string, url: result.content?.html_url as string };
  });

/** Push multiple files via batch (creates a tree + commit) */
export const pushMultipleFiles = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    token: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
    branch: z.string().min(1),
    files: z.array(z.object({ path: z.string(), content: z.string() })).min(1).max(50),
    message: z.string().min(1).max(500),
  }).parse)
  .handler(async ({ data }) => {
    // 1. Get latest commit SHA for the branch
    const ref = await ghFetch(
      `/repos/${data.owner}/${data.repo}/git/ref/heads/${data.branch}`,
      data.token,
    );
    const latestCommitSha = ref.object.sha as string;

    // 2. Get the tree SHA of that commit
    const commit = await ghFetch(
      `/repos/${data.owner}/${data.repo}/git/commits/${latestCommitSha}`,
      data.token,
    );
    const baseTreeSha = commit.tree.sha as string;

    // 3. Create blobs for each file
    const tree = await Promise.all(
      data.files.map(async (f) => {
        const blob = await ghFetch(
          `/repos/${data.owner}/${data.repo}/git/blobs`,
          data.token,
          { method: "POST", body: JSON.stringify({ content: f.content, encoding: "utf-8" }) },
        );
        return {
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha as string,
        };
      }),
    );

    // 4. Create new tree
    const newTree = await ghFetch(
      `/repos/${data.owner}/${data.repo}/git/trees`,
      data.token,
      { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree }) },
    );

    // 5. Create commit
    const newCommit = await ghFetch(
      `/repos/${data.owner}/${data.repo}/git/commits`,
      data.token,
      {
        method: "POST",
        body: JSON.stringify({
          message: data.message,
          tree: newTree.sha,
          parents: [latestCommitSha],
        }),
      },
    );

    // 6. Update ref
    await ghFetch(
      `/repos/${data.owner}/${data.repo}/git/refs/heads/${data.branch}`,
      data.token,
      { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) },
    );

    return { commitSha: newCommit.sha as string, url: newCommit.html_url as string };
  });
