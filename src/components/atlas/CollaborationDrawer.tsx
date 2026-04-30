import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Invitation = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  created_at: string;
};

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  resolved: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectName?: string;
  sessionId?: string | null;
  projectId?: string | null;
  userId?: string | null;
};

// Cast helper for tables not yet in generated types
function invitationsTable() {
  return (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from("project_invitations");
}
function commentsTable() {
  return (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from("session_comments");
}

export function CollaborationDrawer({ open, onClose, projectName, sessionId, projectId, userId }: Props) {
  const [tab, setTab] = useState<"share" | "comments">("share");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  // Load invitations
  const loadInvitations = useCallback(async () => {
    if (!projectId || !userId) return;
    const { data } = await invitationsTable()
      .select("*")
      .eq("project_id", projectId)
      .eq("invited_by", userId)
      .order("created_at", { ascending: false }) as { data: Invitation[] | null };
    setInvitations(data ?? []);
  }, [projectId, userId]);

  // Load comments
  const loadComments = useCallback(async () => {
    if (!sessionId || !userId) return;
    const { data } = await commentsTable()
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }) as { data: Comment[] | null };
    setComments(data ?? []);
  }, [sessionId, userId]);

  useEffect(() => {
    if (!open) return;
    loadInvitations();
    loadComments();
  }, [open, loadInvitations, loadComments]);

  // Realtime subscription for comments
  useEffect(() => {
    if (!open || !sessionId) return;
    const channel = supabase
      .channel(`comments-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "session_comments", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const newC = payload.new as Comment;
          setComments((prev) => {
            if (prev.some((c) => c.id === newC.id)) return prev;
            return [...prev, newC];
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, sessionId]);

  if (!open) return null;

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !projectId || !userId) return;
    setLoading(true);
    const { error } = await invitationsTable().insert({
      project_id: projectId,
      invited_by: userId,
      invited_email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      status: "pending",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
    await loadInvitations();
  };

  const handleComment = async () => {
    if (!newComment.trim() || !sessionId || !userId) return;
    const { error } = await commentsTable().insert({
      session_id: sessionId,
      user_id: userId,
      content: newComment.trim(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewComment("");
    // Realtime will add it, but also reload to be sure
    await loadComments();
  };

  const shareLink = typeof window !== "undefined"
    ? `${window.location.origin}/session/${sessionId ?? "preview"}`
    : "";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", justifyContent: "flex-end" }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          animation: "atlas-sys-backdrop-in 200ms ease forwards",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "min(380px, 90vw)",
          height: "100%",
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur))",
          borderLeft: "0.5px solid var(--glass-border)",
          display: "flex",
          flexDirection: "column",
          animation: "atlas-sys-menu-in 250ms cubic-bezier(0.4,0,0.2,1) forwards",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 16px 12px",
            borderBottom: "0.5px solid var(--glass-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="var(--accent-gold)" strokeWidth={1.4}>
              <circle cx="6" cy="6" r="3" />
              <circle cx="11" cy="11" r="3" />
              <path d="M8.5 4.5l3 3" strokeLinecap="round" />
            </svg>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent-gold)",
              }}
            >
              Collaborate
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-text)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} stroke="currentColor" fill="none" strokeWidth={1.6}>
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "0.5px solid var(--glass-border)" }}>
          {(["share", "comments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "transparent",
                border: "none",
                borderBottom: tab === t ? "2px solid var(--accent-gold)" : "2px solid transparent",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: tab === t ? "var(--accent-gold)" : "var(--muted-text)",
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              {t === "share" ? "Share" : `Comments (${comments.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {tab === "share" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Share link */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", display: "block", marginBottom: 6 }}>
                  Session Link
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    readOnly
                    value={shareLink}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "var(--surface-alt)", border: "0.5px solid var(--border)", color: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Link copied"); }}
                    style={{ padding: "8px 12px", borderRadius: 8, background: "var(--surface-alt)", border: "0.5px solid var(--border)", color: "var(--accent-gold)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Invite */}
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", display: "block", marginBottom: 6 }}>
                  Invite Collaborator
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "var(--surface-alt)", border: "0.5px solid var(--border)", color: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 11 }}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                    style={{ padding: "8px 8px", borderRadius: 8, background: "var(--surface-alt)", border: "0.5px solid var(--border)", color: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 10 }}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || loading}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "10px",
                    borderRadius: 8,
                    background: inviteEmail.trim() ? "var(--accent-gold)" : "var(--surface-alt)",
                    border: "none",
                    color: inviteEmail.trim() ? "var(--background)" : "var(--muted-text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    cursor: inviteEmail.trim() ? "pointer" : "default",
                    transition: "all 180ms ease",
                  }}
                >
                  {loading ? "Sending…" : "Send Invite"}
                </button>
              </div>

              {/* Invitations list */}
              {invitations.length > 0 && (
                <div>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)", display: "block", marginBottom: 8 }}>
                    Pending Invitations
                  </label>
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "var(--surface-alt)",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: "color-mix(in oklab, var(--accent-gold) 20%, transparent)",
                            border: "0.5px solid color-mix(in oklab, var(--accent-gold) 30%, transparent)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: "var(--accent-gold)",
                            fontWeight: 600,
                          }}
                        >
                          {inv.invited_email[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--foreground)" }}>
                          {inv.invited_email}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: inv.status === "pending" ? "var(--accent-gold)" : "var(--muted-text)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: inv.status === "pending"
                            ? "color-mix(in oklab, var(--accent-gold) 10%, transparent)"
                            : "transparent",
                        }}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Comments tab */
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {comments.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted-text)", fontSize: 12, lineHeight: 1.6 }}>
                    No comments yet. Leave notes for your team about decisions, questions, or context.
                  </div>
                ) : (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "var(--surface-alt)",
                        border: "0.5px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--foreground)" }}>
                          {c.user_id === userId ? "You" : c.user_id.slice(0, 8)}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--muted-text)", fontFamily: "var(--font-mono)" }}>
                          {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.5, margin: 0 }}>
                        {c.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {/* Comment input */}
              <div style={{ paddingTop: 12, borderTop: "0.5px solid var(--glass-border)", marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    placeholder="Add a comment…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleComment()}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, background: "var(--surface-alt)", border: "0.5px solid var(--border)", color: "var(--foreground)", fontSize: 12 }}
                  />
                  <button
                    onClick={handleComment}
                    disabled={!newComment.trim()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: newComment.trim() ? "var(--accent-gold)" : "var(--surface-alt)",
                      border: "none",
                      color: newComment.trim() ? "var(--background)" : "var(--muted-text)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: newComment.trim() ? "pointer" : "default",
                    }}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
