import { useState } from "react";
import { toast } from "sonner";

type RepoInfo = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
};

const MOCK_BRANCHES = ["main", "develop", "feature/atlas-ui", "feature/codegen-v2"];

/**
 * GitHubDrawer — Connect a GitHub repo, pick a branch, push/pull generated code.
 * Currently uses local state to simulate the flow. A real GitHub OAuth + API
 * integration would replace the mock helpers.
 */
export function GitHubDrawer({ open, onClose, projectId }: Props) {
  const [step, setStep] = useState<"connect" | "connected">("connect");
  const [repoUrl, setRepoUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [activeBranch, setActiveBranch] = useState("main");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  if (!open) return null;

  const handleConnect = async () => {
    const trimmed = repoUrl.trim();
    const match = trimmed.match(/github\.com\/([^/]+)\/([^/\s.]+)/);
    if (!match) {
      toast.error("Enter a valid GitHub repo URL (e.g. https://github.com/user/repo)");
      return;
    }
    setConnecting(true);
    // Simulate OAuth + repo validation
    await new Promise((r) => setTimeout(r, 1200));
    setRepo({
      owner: match[1],
      name: match[2],
      url: trimmed,
      defaultBranch: "main",
    });
    setActiveBranch("main");
    setStep("connected");
    setConnecting(false);
    toast.success(`Connected to ${match[1]}/${match[2]}`);
  };

  const handleSync = async (direction: "push" | "pull") => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setSyncing(false);
    setLastSync(new Date().toLocaleTimeString());
    toast.success(direction === "push" ? "Pushed to GitHub" : "Pulled from GitHub");
  };

  const handleDisconnect = () => {
    setRepo(null);
    setStep("connect");
    setRepoUrl("");
    setLastSync(null);
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
              {/* GitHub icon */}
              <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--foreground)" }}>GitHub</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-text)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                {repo ? `${repo.owner}/${repo.name}` : "Connect your repository"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "transparent",
              border: "0.5px solid var(--border)",
              color: "var(--muted-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
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
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Intro */}
              <div style={{ fontSize: 12, color: "var(--muted-text)", lineHeight: 1.6 }}>
                Link a GitHub repository to sync Atlas-generated code. Paste your repo URL below to get started.
              </div>

              {/* URL input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted-text)",
                    opacity: 0.7,
                  }}
                >
                  Repository URL
                </label>
                <input
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    outline: "none",
                    transition: "border-color 160ms ease",
                  }}
                />
              </div>

              {/* Connect button */}
              <button
                onClick={handleConnect}
                disabled={connecting || !repoUrl.trim()}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: connecting || !repoUrl.trim()
                    ? "var(--surface)"
                    : "var(--accent-gold)",
                  border: "none",
                  color: connecting || !repoUrl.trim()
                    ? "var(--muted-text)"
                    : "var(--background)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: connecting || !repoUrl.trim() ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 200ms ease",
                }}
              >
                {connecting ? (
                  <>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 600ms linear infinite",
                      }}
                    />
                    Connecting…
                  </>
                ) : (
                  "Connect Repository"
                )}
              </button>

              {/* OAuth hint */}
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--muted-text)",
                  opacity: 0.5,
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                Atlas will request read/write access to sync generated components.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Repo status card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "0.5px solid color-mix(in oklab, var(--accent-gold) 15%, var(--border))",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 8px rgba(34,197,94,0.5)",
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>Connected</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-gold)", marginBottom: 4 }}>
                  {repo?.owner}/{repo?.name}
                </div>
                {lastSync && (
                  <div style={{ fontSize: 10, color: "var(--muted-text)", opacity: 0.6 }}>
                    Last sync: {lastSync}
                  </div>
                )}
              </div>

              {/* Branch selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--muted-text)",
                    opacity: 0.7,
                  }}
                >
                  Active Branch
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {MOCK_BRANCHES.map((branch) => {
                    const isActive = activeBranch === branch;
                    return (
                      <button
                        key={branch}
                        onClick={() => {
                          setActiveBranch(branch);
                          toast.success(`Switched to ${branch}`);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 16,
                          border: `0.5px solid ${isActive ? "var(--accent-gold)" : "var(--border)"}`,
                          background: isActive
                            ? "color-mix(in oklab, var(--accent-gold) 12%, var(--surface))"
                            : "var(--surface)",
                          color: isActive ? "var(--accent-gold)" : "var(--muted-text)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          cursor: "pointer",
                          transition: "all 160ms ease",
                        }}
                      >
                        {branch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Push / Pull controls */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => handleSync("push")}
                  disabled={syncing}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: syncing ? "var(--surface)" : "var(--accent-gold)",
                    border: "none",
                    color: syncing ? "var(--muted-text)" : "var(--background)",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: syncing ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 200ms ease",
                  }}
                >
                  <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 12V4M5 7l3-3 3 3" />
                  </svg>
                  Push
                </button>
                <button
                  onClick={() => handleSync("pull")}
                  disabled={syncing}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "var(--surface)",
                    border: "0.5px solid var(--border)",
                    color: syncing ? "var(--muted-text)" : "var(--foreground)",
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: syncing ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 200ms ease",
                  }}
                >
                  <svg viewBox="0 0 16 16" width={12} height={12} stroke="currentColor" fill="none" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 4v8M5 9l3 3 3-3" />
                  </svg>
                  Pull
                </button>
              </div>

              {/* Syncing indicator */}
              {syncing && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: 12,
                    color: "var(--accent-gold)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    letterSpacing: "0.06em",
                    animation: "atlas-bubble-in 200ms ease forwards",
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid var(--accent-gold)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 600ms linear infinite",
                    }}
                  />
                  Syncing with {activeBranch}…
                </div>
              )}

              {/* Disconnect */}
              <button
                onClick={handleDisconnect}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "0.5px solid color-mix(in oklab, var(--ember) 30%, var(--border))",
                  color: "var(--ember)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  opacity: 0.7,
                  transition: "opacity 160ms ease",
                  textAlign: "center",
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
