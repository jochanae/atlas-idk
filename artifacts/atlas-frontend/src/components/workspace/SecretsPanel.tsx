import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

type Secret = {
  id: number | string;
  projectId: number;
  label: string;
  maskedValue: string;
};

type SecretsPanelProps = {
  projectId: number;
  projectName: string;
};

export function SecretsPanel({ projectId, projectName }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which secret is in "rotate" mode (showing inline update form)
  const [rotatingId, setRotatingId] = useState<number | string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [rotating, setRotating] = useState(false);
  const rotateInputRef = useRef<HTMLInputElement>(null);

  const mono: React.CSSProperties = { fontFamily: "var(--app-font-mono)" };

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/secrets?projectId=${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const all = (Array.isArray(data) ? data : data?.secrets ?? []) as Secret[];
      setSecrets(all.filter((s) => Number(s.projectId) === projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load secrets");
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadSecrets(); }, [loadSecrets]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!label.trim() || !value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, projectName, label: label.trim(), value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLabel("");
      setValue("");
      await loadSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save secret");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (secretId: Secret["id"]) => {
    setError(null);
    try {
      const res = await fetch(`/api/secrets/${secretId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete secret");
    }
  };

  const startRotate = (id: Secret["id"]) => {
    setRotatingId(id);
    setRotateValue("");
    setTimeout(() => rotateInputRef.current?.focus(), 40);
  };

  const cancelRotate = () => {
    setRotatingId(null);
    setRotateValue("");
  };

  const handleRotate = async (secretId: Secret["id"]) => {
    if (!rotateValue.trim()) return;
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`/api/secrets/${secretId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: rotateValue }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRotatingId(null);
      setRotateValue("");
      await loadSecrets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update secret");
    } finally {
      setRotating(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--atlas-border)",
    borderRadius: 8,
    padding: "9px 10px",
    background: "var(--atlas-surface)",
    color: "var(--atlas-fg)",
    ...mono,
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  const pillBtn = (active = false): React.CSSProperties => ({
    border: `1px solid ${active ? "var(--atlas-gold)" : "var(--atlas-border)"}`,
    borderRadius: 999,
    padding: "6px 10px",
    background: "transparent",
    color: active ? "var(--atlas-gold)" : "var(--atlas-muted)",
    cursor: "pointer",
    ...mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, padding: 16, background: "var(--atlas-surface)", color: "var(--atlas-fg)", ...mono, overflowY: "auto" }}>

      {/* Header */}
      <div style={{ border: "1px solid var(--atlas-border)", borderRadius: 12, padding: 14, background: "var(--atlas-surface)" }}>
        <div style={{ color: "var(--atlas-gold)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
          Environment Variables
        </div>
        <div style={{ color: "var(--atlas-muted)", fontSize: 11, lineHeight: 1.6 }}>
          Encrypted API keys and secrets for <strong style={{ color: "var(--atlas-fg)", fontWeight: 600 }}>{projectName}</strong>. Atlas knows which keys are configured so it can reference them in generated code.
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--atlas-border)", borderRadius: 12, padding: 14, background: "var(--atlas-surface)" }}>
        <div style={{ color: "var(--atlas-gold)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Add Variable
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="OPENAI_API_KEY"
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          type="password"
          style={inputStyle}
          autoComplete="new-password"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="submit"
            disabled={saving || !label.trim() || !value.trim()}
            style={{
              ...pillBtn(true),
              opacity: saving || !label.trim() || !value.trim() ? 0.5 : 1,
              cursor: saving || !label.trim() || !value.trim() ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Add"}
          </button>
          <span style={{ color: "var(--atlas-muted)", fontSize: 10, opacity: 0.6 }}>
            AES-256 encrypted at rest
          </span>
        </div>
      </form>

      {error && (
        <div style={{ border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: 10, color: "#f87171", fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Secret list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <div style={{ color: "var(--atlas-muted)", fontSize: 11 }}>Loading…</div>
        ) : secrets.length === 0 ? (
          <div style={{ border: "1px solid var(--atlas-border)", borderRadius: 10, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ color: "var(--atlas-fg)", fontSize: 11, fontWeight: 600, opacity: 0.7 }}>
              No environment variables configured yet.
            </div>
            <div style={{ color: "var(--atlas-muted)", fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
              Add API keys, connection strings, or other runtime values. They're stored encrypted and Atlas references them by label in generated code.
            </div>
          </div>
        ) : (
          secrets.map((secret) => (
            <div key={secret.id} style={{ border: "1px solid var(--atlas-border)", borderRadius: 10, background: "var(--atlas-surface)" }}>
              {/* Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: "var(--atlas-fg)", fontSize: 12, marginBottom: 2, fontWeight: 600 }}>
                    {secret.label}
                  </div>
                  <div style={{ color: "var(--atlas-muted)", fontSize: 11 }}>
                    {secret.maskedValue}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => rotatingId === secret.id ? cancelRotate() : startRotate(secret.id)}
                    style={pillBtn(rotatingId === secret.id)}
                  >
                    {rotatingId === secret.id ? "Cancel" : "Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(secret.id)}
                    style={{ ...pillBtn(), color: "rgba(248,113,113,0.75)", borderColor: "rgba(248,113,113,0.25)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Inline rotate form */}
              {rotatingId === secret.id && (
                <div style={{ borderTop: "1px solid var(--atlas-border)", padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    ref={rotateInputRef}
                    type="password"
                    value={rotateValue}
                    onChange={(e) => setRotateValue(e.target.value)}
                    placeholder="New value"
                    autoComplete="new-password"
                    style={{ ...inputStyle, padding: "7px 10px", flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRotate(secret.id);
                      if (e.key === "Escape") cancelRotate();
                    }}
                  />
                  <button
                    type="button"
                    disabled={rotating || !rotateValue.trim()}
                    onClick={() => void handleRotate(secret.id)}
                    style={{
                      ...pillBtn(true),
                      opacity: rotating || !rotateValue.trim() ? 0.5 : 1,
                      cursor: rotating || !rotateValue.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {rotating ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* gitignore reminder */}
      {secrets.length > 0 && (
        <div style={{ border: "1px dashed rgba(201,162,76,0.2)", borderRadius: 10, padding: "10px 12px", fontSize: 10.5, color: "var(--atlas-muted)", lineHeight: 1.6, opacity: 0.75 }}>
          <span style={{ color: "var(--atlas-gold)", fontWeight: 700 }}>Reminder:</span> If you have a local <code>.env</code> file, make sure it's in your <code>.gitignore</code> before pushing to GitHub. Atlas adds this automatically when it writes code that references env vars.
        </div>
      )}
    </div>
  );
}
