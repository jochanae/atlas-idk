import { useState, useCallback } from "react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import {
  validateGitHubToken,
  getRepoInfo,
  listBranches,
  pushMultipleFiles,
  getFileContent,
  getGitHubOAuthUrl,
  exchangeGitHubCode,
} from "@/server/github.functions";

type RepoInfo = {
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
};

type GHUser = {
  login: string;
  avatar_url: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  /** Generated files to push */
  generatedFiles?: Array<{ filename: string; language: string; content: string }>;
};

const TOKEN_KEY = "atlas-github-pat";

/**
 * GitHubDrawer — Connect via Personal Access Token, pick branch, push/pull code.
 * Uses real GitHub API calls via server functions.
 */
export function GitHubDrawer({ open, onClose, projectId, generatedFiles = [] }: Props) {
  const [step, setStep] = useState<"connect" | "connected">(() => {
    if (typeof window !== "undefined" && localStorage.getItem(TOKEN_KEY)) return "connected";
    return "connect";
  });
  const [token, setToken] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) ?? "" : "",
  );
  const [repoUrl, setRepoUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [ghUser, setGhUser] = useState<GHUser | null>(null);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pullResult, setPullResult] = useState<string | null>(null);

  const loadRepo = useCallback(async (pat: string, owner: string, name: string) => {
    const [repoInfo, branchList] = await Promise.all([
      getRepoInfo({ data: { token: pat, owner, repo: name } }),
      listBranches({ data: { token: pat, owner, repo: name } }),
    ]);
    setRepo({
      owner,
      name,
      full_name: repoInfo.full_name,
      default_branch: repoInfo.default_branch,
      private: repoInfo.private,
      html_url: repoInfo.html_url,
    });
    setBranches(branchList);
    setActiveBranch(repoInfo.default_branch);
  }, []);

  if (!open) return null;

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Enter your GitHub Personal Access Token");
      return;
    }
    const trimmedUrl = repoUrl.trim();
    const match = trimmedUrl.match(/github\.com\/([^/]+)\/([^/\s.]+)/);
    if (!match) {
      toast.error("Enter a valid GitHub repo URL");
      return;
    }

    setConnecting(true);
    try {
      // Validate token
      const user = await validateGitHubToken({ data: { token: token.trim() } });
      setGhUser(user);

      // Load repo
      await loadRepo(token.trim(), match[1], match[2]);

      // Persist token
      localStorage.setItem(TOKEN_KEY, token.trim());
      setStep("connected");
      toast.success(`Connected as ${user.login}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handlePush = async () => {
    if (!repo || !token || generatedFiles.length === 0) {
      toast.error("No files to push");
      return;
    }
    setSyncing(true);
    try {
      const files = generatedFiles.map((f) => ({
        path: f.filename.startsWith("src/") ? f.filename : `src/components/${f.filename}`,
        content: f.content,
      }));
      const result = await pushMultipleFiles({
        data: {
          token,
          owner: repo.owner,
          repo: repo.name,
          branch: activeBranch,
          files,
          message: `feat(atlas): push ${files.length} generated file(s)`,
        },
      });
      setLastSync(new Date().toLocaleTimeString());
      toast.success(`Pushed ${files.length} file(s) — ${result.commitSha.slice(0, 7)}`);
      haptic("medium");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Push failed";
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!repo || !token) return;
    setSyncing(true);
    setPullResult(null);
    try {
      // Pull a sample file to demonstrate connectivity
      const result = await getFileContent({
        data: {
          token,
          owner: repo.owner,
          repo: repo.name,
          path: "README.md",
          branch: activeBranch,
        },
      });
      setLastSync(new Date().toLocaleTimeString());
      if (result) {
        setPullResult(result.content.slice(0, 300));
        toast.success("Pulled from GitHub");
      } else {
        toast("No README.md found on this branch");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pull failed";
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    setActiveBranch(branch);
    toast.success(`Switched to ${branch}`);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setRepo(null);
    setGhUser(null);
    setBranches([]);
    setStep("connect");
    setToken("");
    setRepoUrl("");
    setLastSync(null);
    setPullResult(null);
    toast("Disconnected from GitHub");
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        justifyContent: "flex-end",
        animation: "atlas-bubble-in 200ms ease forwards",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(380px, 90vw)",
          height: "100%",
          background: "var(--background)",
          borderLeft: "1px solid var(--glass-border)",
          display: "flex",
          flexDirection: "column",
          animation: "atlas-drawer-slide 280ms cubic-bezier(0.4, 0, 0.2, 1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 14px",
            borderBottom: "0.5px solid var(--glass-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)",
                border: "0.5px solid color-mix(in oklab, var(--accent-gold) 20%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-gold)",
              }}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--foreground)" }}>GitHub</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-text)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                {ghUser ? `@${ghUser.login}` : repo ? `${repo.owner}/${repo.name}` : "Connect your repository"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "0.5px solid var(--border)",
              color: "var(--muted-text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {step === "connect" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.6 }}>
                Connect with a GitHub Personal Access Token. Create one at{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-gold)", textDecoration: "none" }}
                >
                  github.com/settings/tokens
                </a>{" "}
                with <code style={{ color: "var(--accent-gold)", fontSize: 11 }}>repo</code> scope.
              </div>

              {/* PAT input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", opacity: 0.7 }}>
                  Personal Access Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxx…"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: "var(--foreground)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none",
                  }}
                />
              </div>

              {/* Repo URL */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", opacity: 0.7 }}>
                  Repository URL
                </label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: "var(--foreground)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none",
                  }}
                />
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !token.trim() || !repoUrl.trim()}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 10,
                  background: connecting || !token.trim() || !repoUrl.trim() ? "var(--surface)" : "var(--accent-gold)",
                  border: "none",
                  color: connecting || !token.trim() || !repoUrl.trim() ? "var(--muted-text)" : "var(--background)",
                  fontWeight: 600, fontSize: 13, cursor: connecting ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 200ms ease",
                }}
              >
                {connecting ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 600ms linear infinite" }} />
                    Connecting…
                  </>
                ) : (
                  "Connect Repository"
                )}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Repo status */}
              <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, var(--border))" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.5)" }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>
                    Connected{ghUser ? ` as @${ghUser.login}` : ""}
                  </span>
                  {repo?.private && (
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "color-mix(in oklab, var(--accent-gold) 10%, transparent)", color: "var(--accent-gold)", fontFamily: "var(--font-mono)" }}>
                      PRIVATE
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-gold)", marginBottom: 4 }}>
                  {repo?.full_name ?? ""}
                </div>
                {lastSync && (
                  <div style={{ fontSize: 10, color: "var(--muted-text)", opacity: 0.6 }}>
                    Last sync: {lastSync}
                  </div>
                )}
              </div>

              {/* Branch selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", opacity: 0.7 }}>
                  Active Branch
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {branches.map((branch) => {
                    const isActive = activeBranch === branch;
                    return (
                      <button
                        key={branch}
                        onClick={() => handleSwitchBranch(branch)}
                        style={{
                          padding: "6px 12px", borderRadius: 16,
                          border: `0.5px solid ${isActive ? "var(--accent-gold)" : "var(--border)"}`,
                          background: isActive ? "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))" : "var(--surface)",
                          color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
                          fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", transition: "all 160ms ease",
                        }}
                      >
                        {branch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Push / Pull */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handlePush}
                  disabled={syncing || generatedFiles.length === 0}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: 10,
                    background: syncing || generatedFiles.length === 0 ? "var(--surface)" : "var(--accent-gold)",
                    border: "none",
                    color: syncing || generatedFiles.length === 0 ? "var(--muted-text)" : "var(--background)",
                    fontWeight: 600, fontSize: 12, cursor: syncing ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 200ms ease",
                  }}
                >
                  <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 12V4M5 7l3-3 3 3" />
                  </svg>
                  Push {generatedFiles.length > 0 ? `(${generatedFiles.length})` : ""}
                </button>
                <button
                  onClick={handlePull}
                  disabled={syncing}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: 10,
                    background: "var(--surface)", border: "0.5px solid var(--border)",
                    color: syncing ? "var(--muted-text)" : "var(--foreground)",
                    fontWeight: 500, fontSize: 12, cursor: syncing ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 200ms ease",
                  }}
                >
                  <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 4v8M5 9l3 3 3-3" />
                  </svg>
                  Pull
                </button>
              </div>

              {syncing && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, color: "var(--accent-gold)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", animation: "atlas-bubble-in 200ms ease forwards" }}>
                  <div style={{ width: 14, height: 14, border: "2px solid var(--accent-gold)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 600ms linear infinite" }} />
                  Syncing with {activeBranch}…
                </div>
              )}

              {/* Pull result preview */}
              {pullResult && (
                <div style={{ padding: 12, borderRadius: 10, background: "var(--surface)", border: "0.5px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted-text)", lineHeight: 1.5, maxHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                  {pullResult}
                </div>
              )}

              {/* Disconnect */}
              <button
                onClick={handleDisconnect}
                style={{
                  marginTop: 8, padding: "8px 12px", borderRadius: 8,
                  background: "transparent", border: "0.5px solid color-mix(in oklab, var(--ember) 30%, var(--border))",
                  color: "var(--ember)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em",
                  cursor: "pointer", opacity: 0.7, textAlign: "center",
                }}
              >
                Disconnect Repository
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes atlas-drawer-slide {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
