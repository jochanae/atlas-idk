import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export interface RuntimeCardData {
  projectId: number;
  report: {
    overallStatus: string;
    repositoryType: string;
    targets: Array<{
      id: string;
      role: string;
      framework: string;
      workingDirectory: string;
      installCommand: string;
      startCommand: string;
      expectedPort?: number;
      status: string;
      environmentVariables: string[];
      externalServices: string[];
      confidence: string;
    }>;
    recommendation?: {
      targetId: string;
      reasons: string[];
    };
    requirements: {
      environmentVariables: Array<{
        name: string;
        classification: string;
        sensitivity: string;
        source: string[];
        defaultValue?: string;
      }>;
      externalServices: Array<{
        service: string;
        evidence: string;
        connectionSupport: string;
        serviceId?: string;
        provisionMode?: string;
        knownEnvVars?: string[];
        providerLabel?: string;
      }>;
    };
  };
}

interface DevServerStatus {
  status: string;
  port?: number | null;
  logs?: string[];
  errorMsg?: string | null;
  startedAt?: string | null;
  verifiedTargetId?: string | null;
  verifiedAt?: string | null;
  lastVerifiedTargetId?: string | null;
  lastVerifiedAt?: string | null;
  readiness?: {
    configuration: "ready" | "changed" | "missing";
    dependencies: "ready" | "reinstall-required";
    classification: "current" | "stale";
  };
}

interface RuntimeEvent {
  id: number;
  event_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

type CardPhase = "decision" | "configuring" | "confirming" | "polling" | "connected" | "crashed" | "error";

interface EnvFieldState {
  name: string;
  value: string;
  classification: string;
  sensitivity: string;
  source: string[];
  defaultValue?: string;
}

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  padding: "16px 18px",
  marginTop: 10,
  fontFamily: "var(--app-font-sans, system-ui, sans-serif)",
  maxWidth: 520,
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--app-font-mono, monospace)",
  fontSize: 11,
  letterSpacing: "0.04em",
};

const BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  ...MONO,
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: "7px 14px",
  background: "transparent",
  border: "1px solid var(--atlas-gold, #d4a855)",
  borderRadius: 7,
  color: "var(--atlas-gold, #d4a855)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.03em",
  transition: "opacity 0.15s",
};

const BTN_GHOST: React.CSSProperties = {
  padding: "7px 12px",
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 7,
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  fontSize: 12,
  transition: "border-color 0.15s, color 0.15s",
};

const BTN_DANGER: React.CSSProperties = {
  ...BTN_GHOST,
  color: "rgba(255,100,100,0.8)",
  borderColor: "rgba(255,100,100,0.25)",
};

const LABEL_REQUIRED: React.CSSProperties = {
  ...BADGE,
  background: "rgba(220,80,80,0.12)",
  color: "rgba(255,140,140,0.9)",
  border: "1px solid rgba(220,80,80,0.2)",
};

const LABEL_OPTIONAL: React.CSSProperties = {
  ...BADGE,
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(255,255,255,0.1)",
};

function classificationLabel(c: string): React.ReactNode {
  if (c === "required-to-boot") return <span style={LABEL_REQUIRED}>Required to boot</span>;
  if (c === "required-for-feature") return <span style={LABEL_REQUIRED}>Required for feature</span>;
  if (c === "has-default") return <span style={LABEL_OPTIONAL}>Has default</span>;
  return <span style={LABEL_OPTIONAL}>Optional</span>;
}

function targetStatusLabel(status: string): { dot: string; text: string } {
  switch (status) {
    case "likely-runnable": return { dot: "#4ade80", text: "Ready to run" };
    case "configuration-required": return { dot: "#facc15", text: "Configuration required" };
    case "external-service-required": return { dot: "#fb923c", text: "External service required" };
    case "likely-inactive": return { dot: "#94a3b8", text: "Likely inactive" };
    case "unsupported": return { dot: "#f87171", text: "Unsupported" };
    default: return { dot: "#94a3b8", text: status };
  }
}

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    runtime_connected:  "✓ Connected",
    runtime_stopped:    "■ Stopped",
    runtime_crashed:    "✗ Crashed",
    install_started:    "↓ Installing",
    install_completed:  "✓ Installed",
    start_requested:    "→ Starting",
    stop_requested:     "■ Stop requested",
    restart_requested:  "↺ Restart requested",
    drift_detected:     "⚠ Drift detected",
    reinstall_required: "⚠ Reinstall needed",
    runtime_error:      "✗ Error",
  };
  return map[type] ?? type;
}

function ReadinessBadges({ readiness }: { readiness: DevServerStatus["readiness"] }) {
  if (!readiness) return null;
  const WARN: React.CSSProperties = { ...({ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500 } as React.CSSProperties), background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      {readiness.configuration !== "ready" && (
        <span style={WARN}>⚠ {readiness.configuration === "missing" ? "config missing" : "config changed"}</span>
      )}
      {readiness.dependencies === "reinstall-required" && (
        <span style={WARN}>⚠ reinstall needed</span>
      )}
      {readiness.classification === "stale" && (
        <span style={WARN}>⚠ target changed</span>
      )}
    </div>
  );
}

function StepList({ serverStatus, selectedTargetId }: { serverStatus: DevServerStatus | null; selectedTargetId: string }) {
  const s = serverStatus?.status ?? "idle";
  const verified = serverStatus?.verifiedTargetId === selectedTargetId;
  const step = (done: boolean, active: boolean, label: string) => (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "3px 0" }}>
      <span style={{ width: 16, textAlign: "center", fontSize: 13, color: done ? "#4ade80" : active ? "var(--atlas-gold, #d4a855)" : "rgba(255,255,255,0.25)" }}>
        {done ? "✓" : active ? "◌" : "○"}
      </span>
      <span style={{ fontSize: 13, color: done ? "rgba(255,255,255,0.8)" : active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
        {label}
      </span>
    </div>
  );

  const installing = s === "installing";
  const starting = s === "starting" || s === "running";
  const checking = s === "running" && !verified;
  const done = verified;

  return (
    <div style={{ margin: "12px 0", padding: "10px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
      {step(true, false, "Target selected")}
      {step(true, false, "Configuration accepted")}
      {step(done || starting, installing, "Installing dependencies")}
      {step(done || checking, starting && !done, "Starting app")}
      {step(done, checking, "Checking connection")}
    </div>
  );
}

export function RuntimeDecisionCard({ data, projectId }: { data: RuntimeCardData; projectId: number }) {
  const { report } = data;
  const effectiveProjectId = data.projectId || projectId;

  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    report.recommendation?.targetId ?? report.targets[0]?.id ?? ""
  );
  const [phase, setPhase] = useState<CardPhase>("decision");
  const [serverStatus, setServerStatus] = useState<DevServerStatus | null>(null);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [envFields, setEnvFields] = useState<EnvFieldState[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serviceBindings, setServiceBindings] = useState<Map<string, { bindingId: string; envVarNames: string[] }>>(new Map());
  const [activeProvisionInput, setActiveProvisionInput] = useState<string | null>(null);
  const [provisionInputValue, setProvisionInputValue] = useState("");
  const [provisioningServiceId, setProvisioningServiceId] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const lastRunArgsRef = useRef<{ env: Record<string, string>; serviceBindingIds: string[]; targetId: string } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const selectedTarget = report.targets.find(t => t.id === selectedTargetId) ?? report.targets[0];
  const otherTargets = report.targets.filter(t => t.id !== selectedTargetId && t.status !== "unsupported" && t.status !== "likely-inactive");

  const targetEnvReqs = report.requirements.environmentVariables.filter(r =>
    selectedTarget?.environmentVariables.includes(r.name)
  );
  const requiredVars = targetEnvReqs.filter(r =>
    r.classification === "required-to-boot" || r.classification === "required-for-feature"
  );
  const hasRequiredConfig = requiredVars.length > 0;
  const hasExternalServices = (selectedTarget?.externalServices?.length ?? 0) > 0;

  // Env var names covered by active service bindings — excluded from the manual form.
  // The server resolves these secrets server-side; the browser never holds their values.
  const serviceProvidedVarNames = useMemo(() => {
    const names = new Set<string>();
    for (const { envVarNames } of serviceBindings.values()) {
      envVarNames.forEach(n => names.add(n));
    }
    return names;
  }, [serviceBindings]);

  const effectiveEnvFields = useMemo(
    () => envFields.filter(f => !serviceProvidedVarNames.has(f.name)),
    [envFields, serviceProvidedVarNames],
  );

  const fetchStatus = useCallback(async (): Promise<DevServerStatus | null> => {
    try {
      const res = await fetch(`/api/devserver/workspace/${effectiveProjectId}/status`, { credentials: "include" });
      if (!res.ok) return null;
      const body = await res.json() as DevServerStatus;
      if (mountedRef.current) setServerStatus(body);
      return body;
    } catch {
      return null;
    }
  }, [effectiveProjectId]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/devserver/workspace/${effectiveProjectId}/events`, { credentials: "include" });
      if (!res.ok || !mountedRef.current) return;
      const body = await res.json() as { events: RuntimeEvent[] };
      if (mountedRef.current) setRuntimeEvents(body.events ?? []);
    } catch {
      // non-fatal — history is decorative
    }
  }, [effectiveProjectId]);

  useEffect(() => {
    fetchStatus().then(status => {
      if (!status || !mountedRef.current) return;
      if (status.status === "running" && status.verifiedTargetId === selectedTargetId) {
        setPhase("connected"); fetchEvents();
      } else if (status.status === "crashed") {
        setPhase("crashed"); fetchEvents();
      } else if (status.status === "error") {
        setPhase("error");
      } else if (status.status === "installing" || status.status === "starting" || status.status === "restarting") {
        setPhase("polling");
      }
    });
  }, []); // mount only

  useEffect(() => {
    if (phase !== "polling") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (!status || !mountedRef.current) return;
      if (status.status === "running" && status.verifiedTargetId === selectedTargetId) {
        setPhase("connected"); fetchEvents();
      } else if (status.status === "crashed") {
        setPhase("crashed"); fetchEvents();
      } else if (status.status === "error") {
        setPhase("error");
      } else if (status.status === "stopped" || status.status === "idle") {
        setPhase("decision");
      }
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [phase, fetchStatus, fetchEvents, selectedTargetId]);

  useEffect(() => {
    setEnvFields(requiredVars.map(r => ({
      name: r.name,
      value: r.sensitivity !== "secret" ? (r.defaultValue ?? "") : "",
      classification: r.classification,
      sensitivity: r.sensitivity,
      source: r.source,
      defaultValue: r.sensitivity !== "secret" ? r.defaultValue : undefined,
    })));
  }, [selectedTargetId]);

  const handleRunClicked = () => {
    setSubmitError(null);
    if (hasExternalServices && !hasRequiredConfig) {
      setPhase("confirming");
    } else if (hasRequiredConfig) {
      setPhase("configuring");
    } else {
      setPhase("confirming");
    }
  };

  const handleConfigDone = () => {
    const missing = effectiveEnvFields.filter(f => f.sensitivity === "secret" || f.classification === "required-to-boot").filter(f => !f.value.trim());
    if (missing.length > 0) return;
    setPhase("confirming");
  };

  const handleConfirmedRun = async () => {
    // Only send env vars NOT covered by service bindings.
    // Binding secrets are resolved entirely server-side; the browser never holds their values.
    const env: Record<string, string> = {};
    for (const f of effectiveEnvFields) {
      if (f.value.trim()) env[f.name] = f.value;
    }
    const serviceBindingIds = Array.from(serviceBindings.values()).map(b => b.bindingId);
    // Store the run args so handleRestart can replay them without re-entering config
    lastRunArgsRef.current = { env, serviceBindingIds, targetId: selectedTargetId };
    setEnvFields(prev => prev.map(f => ({ ...f, value: "" })));
    setSubmitError(null);

    try {
      const res = await fetch(`/api/devserver/workspace/${effectiveProjectId}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedTargetId, env, serviceBindingIds }),
      });
      if (res.status === 409) { setPhase("polling"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>;
        setSubmitError(body.error ?? "Failed to start. Please try again.");
        setPhase("decision");
        return;
      }
      setPhase("polling");
    } catch {
      setSubmitError("Network error. Please try again.");
      setPhase("decision");
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`/api/devserver/workspace/${effectiveProjectId}/stop`, { method: "POST", credentials: "include" });
    } catch { /* non-fatal */ }
    setPhase("decision");
    setServerStatus(null);
  };

  const handleRestart = async () => {
    const args = lastRunArgsRef.current ?? { env: {}, serviceBindingIds: [], targetId: selectedTargetId };
    setPhase("polling");
    setServerStatus(null);
    // Stop first so the exit listener classifies this as "restart" not "crash"
    try {
      await fetch(`/api/devserver/workspace/${effectiveProjectId}/stop`, { method: "POST", credentials: "include" });
    } catch { /* proceed regardless */ }
    // Small gap to let the stop propagate before the new /run reserves the slot
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await fetch(`/api/devserver/workspace/${effectiveProjectId}/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, targetId: selectedTargetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>;
        setSubmitError(body.error ?? "Restart failed. Try running again.");
        setPhase("error");
      }
    } catch {
      setSubmitError("Network error during restart.");
      setPhase("error");
    }
  };

  const handleProvision = async (serviceId: string, provisionMode: string | undefined) => {
    setProvisioningServiceId(serviceId);
    setProvisionError(null);
    try {
      const reqBody: Record<string, string> = { service: serviceId };
      if (provisionMode === "existing-connection") {
        if (!provisionInputValue.trim()) {
          setProvisionError("Please enter a connection string.");
          setProvisioningServiceId(null);
          return;
        }
        reqBody.secret = provisionInputValue;
      }
      const res = await fetch(`/api/projects/${effectiveProjectId}/provision-service`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      // Clear the secret from local state immediately — before reading the response —
      // so it is not held in memory any longer than necessary.
      setProvisionInputValue("");
      setActiveProvisionInput(null);
      const data = await res.json() as {
        bindingId?: string;
        environmentVariables?: string[];
        provisionMode?: string;
        providerLabel?: string;
        generatedPath?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.bindingId) {
        setProvisionError(data.error ?? `Could not connect ${serviceId}.`);
        return;
      }
      // Store only the binding reference — never the secret value
      setServiceBindings(prev => {
        const next = new Map(prev);
        next.set(serviceId, {
          bindingId: data.bindingId!,
          envVarNames: data.environmentVariables ?? [],
        });
        return next;
      });
    } catch {
      setProvisionError(`Network error. Please try again.`);
    } finally {
      if (mountedRef.current) setProvisioningServiceId(null);
    }
  };

  const handleOpenPreview = () => {
    window.dispatchEvent(new CustomEvent("axiom:open-preview", { detail: { source: "runtime" } }));
  };

  if (!selectedTarget) {
    return (
      <div style={CARD}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
          No runnable targets found in this repository.
        </p>
      </div>
    );
  }

  const statusInfo = targetStatusLabel(selectedTarget.status);

  return (
    <div style={CARD}>
      {phase === "decision" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusInfo.dot, flexShrink: 0 }} />
            <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {statusInfo.text}
            </span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.88)", marginBottom: 3 }}>
              {selectedTarget.role === "frontend" ? "Web app" : selectedTarget.role === "api" ? "API server" : selectedTarget.role === "fullstack" ? "Full-stack app" : "Application"}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...BADGE, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.65)" }}>
                {selectedTarget.framework}
              </span>
              <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                {selectedTarget.workingDirectory}
              </span>
            </div>
          </div>

          {report.recommendation && (
            <div style={{ marginBottom: 12, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 7, borderLeft: "2px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, ...MONO, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Recommended because
              </div>
              {report.recommendation.reasons.slice(0, 2).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
                  • {r}
                </div>
              ))}
            </div>
          )}

          {selectedTarget.status === "likely-runnable" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Atlas will:</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>• Install this repository's dependencies</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>• Start the {selectedTarget.role === "frontend" ? "frontend" : selectedTarget.role === "api" ? "API server" : "application"}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>• Check that it accepts HTTP connections</div>
            </div>
          )}

          {selectedTarget.status === "configuration-required" && requiredVars.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Required before startup:</div>
              {requiredVars.map(v => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ ...MONO, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{v.name}</span>
                  {classificationLabel(v.classification)}
                  {v.sensitivity === "secret" && <span style={{ ...MONO, fontSize: 10, color: "rgba(255,160,100,0.7)" }}>secret</span>}
                </div>
              ))}
            </div>
          )}

          {selectedTarget.status === "external-service-required" && selectedTarget.externalServices.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,200,100,0.8)", marginBottom: 8 }}>This target needs:</div>
              {selectedTarget.externalServices.map(svcName => {
                const svcReq = report.requirements.externalServices.find(s => s.service === svcName);
                const svcId = svcReq?.serviceId ?? svcName.toLowerCase().trim();
                const provisionMode = svcReq?.provisionMode;
                const isProvisioned = serviceBindings.has(svcId);
                const isProvisioning = provisioningServiceId === svcId;
                const showInput = activeProvisionInput === svcId && !isProvisioned;
                const canConnect = provisionMode === "existing-connection" || provisionMode === "local" || provisionMode === "atlas-managed";
                return (
                  <div key={svcName} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>• {svcName}</span>
                      {isProvisioned ? (
                        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", color: "rgba(74,222,128,0.9)", ...MONO }}>
                          {provisionMode === "local"
                            ? "✓ Local SQLite configured"
                            : "✓ Connected securely — credentials supplied server-side"}
                        </span>
                      ) : canConnect ? (
                        provisionMode === "local" ? (
                          <button
                            type="button"
                            disabled={isProvisioning}
                            onClick={() => handleProvision(svcId, provisionMode)}
                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,220,100,0.1)", border: "1px solid rgba(255,220,100,0.3)", color: "rgba(255,220,100,0.85)", cursor: isProvisioning ? "not-allowed" : "pointer", ...MONO, opacity: isProvisioning ? 0.6 : 1 }}
                          >
                            {isProvisioning ? "Configuring…" : "Configure local SQLite"}
                          </button>
                        ) : showInput ? null : (
                          <button
                            type="button"
                            onClick={() => { setActiveProvisionInput(svcId); setProvisionError(null); }}
                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,220,100,0.1)", border: "1px solid rgba(255,220,100,0.3)", color: "rgba(255,220,100,0.85)", cursor: "pointer", ...MONO }}
                          >
                            Connect {svcName}
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Manual setup required — Atlas does not currently support this service</span>
                      )}
                    </div>
                    {showInput && (
                      <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", ...MONO }}>
                          Connection string — sent once, encrypted at rest, never returned to browser
                        </div>
                        <input
                          type="password"
                          value={provisionInputValue}
                          onChange={e => setProvisionInputValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && provisionInputValue.trim()) handleProvision(svcId, provisionMode); }}
                          placeholder="postgres://user:pass@host:5432/dbname"
                          autoComplete="off"
                          style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, color: "rgba(255,255,255,0.85)", ...MONO, fontSize: 12, outline: "none" }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            disabled={isProvisioning || !provisionInputValue.trim()}
                            onClick={() => handleProvision(svcId, provisionMode)}
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", color: "rgba(74,222,128,0.9)", cursor: isProvisioning ? "not-allowed" : "pointer", ...MONO, opacity: isProvisioning || !provisionInputValue.trim() ? 0.5 : 1 }}
                          >
                            {isProvisioning ? "Connecting…" : "Connect"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setActiveProvisionInput(null); setProvisionInputValue(""); setProvisionError(null); }}
                            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "none", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)", cursor: "pointer", ...MONO }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {provisionError && (
                <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,140,140,0.85)" }}>{provisionError}</div>
              )}
              {selectedTarget.environmentVariables.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.3)", ...MONO }}>
                  Needs: {selectedTarget.environmentVariables.join(", ")}
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                Atlas cannot confirm the app will start until all services are connected.
              </div>
            </div>
          )}

          {serverStatus?.lastVerifiedTargetId && !serverStatus.verifiedTargetId && (
            <div style={{ marginBottom: 12, padding: "6px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 6, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Last connected {relativeTime(serverStatus.lastVerifiedAt)}. Not currently running.
            </div>
          )}

          {submitError && (
            <div style={{ marginBottom: 10, padding: "6px 10px", background: "rgba(220,80,80,0.1)", borderRadius: 6, fontSize: 12, color: "rgba(255,140,140,0.9)", border: "1px solid rgba(220,80,80,0.2)" }}>
              {submitError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: otherTargets.length > 0 ? 10 : 0 }}>
            {(selectedTarget.status === "likely-runnable") && (
              <button type="button" style={BTN_PRIMARY} onClick={handleRunClicked}>Run app</button>
            )}
            {(selectedTarget.status === "configuration-required") && (
              <button type="button" style={BTN_PRIMARY} onClick={handleRunClicked}>Configure and run</button>
            )}
            {(selectedTarget.status === "external-service-required") && (
              <button type="button" style={BTN_PRIMARY} onClick={handleRunClicked}>Configure target</button>
            )}
            <button type="button" style={BTN_GHOST} onClick={() => setShowTechnical(v => !v)}>
              {showTechnical ? "Hide details" : "View technical details"}
            </button>
          </div>

          {otherTargets.length > 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", ...MONO }}>
              Other targets: {otherTargets.map(t => (
                <button key={t.id} type="button" onClick={() => setSelectedTargetId(t.id)} style={{ ...MONO, background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", textDecoration: "underline", fontSize: 11, padding: "0 4px 0 0" }}>
                  {t.workingDirectory}
                </button>
              ))}
            </div>
          )}

          {showTechnical && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0,0,0,0.25)", borderRadius: 8, ...MONO, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <div><span style={{ color: "rgba(255,255,255,0.25)" }}>id</span> {selectedTarget.id}</div>
              <div><span style={{ color: "rgba(255,255,255,0.25)" }}>install</span> {selectedTarget.installCommand}</div>
              <div><span style={{ color: "rgba(255,255,255,0.25)" }}>start</span> {selectedTarget.startCommand}</div>
              {selectedTarget.expectedPort && <div><span style={{ color: "rgba(255,255,255,0.25)" }}>port</span> {selectedTarget.expectedPort}</div>}
              <div><span style={{ color: "rgba(255,255,255,0.25)" }}>confidence</span> {selectedTarget.confidence}</div>
            </div>
          )}
        </>
      )}

      {phase === "configuring" && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 14 }}>
            Configure {selectedTarget.workingDirectory}
          </div>
          {serviceBindings.size > 0 && (
            <div style={{ marginBottom: 14, padding: "8px 10px", background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6 }}>
              {Array.from(serviceBindings.entries()).map(([svcId, binding]) => (
                <div key={svcId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(74,222,128,0.8)", ...MONO }}>
                  <span>✓</span>
                  <span>{svcId}</span>
                  {binding.envVarNames.length > 0 && (
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>→ {binding.envVarNames.join(", ")} provided server-side</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {effectiveEnvFields.map((field) => (
            <div key={field.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ ...MONO, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{field.name}</span>
                {classificationLabel(field.classification)}
                {field.sensitivity === "secret" && (
                  <span style={{ ...MONO, fontSize: 10, color: "rgba(255,160,100,0.7)" }}>secret</span>
                )}
              </div>
              {field.source.length > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 5, ...MONO }}>
                  Used in: {field.source.slice(0, 2).join(", ")}
                </div>
              )}
              {field.defaultValue && field.sensitivity !== "secret" && (
                <div style={{ fontSize: 11, color: "rgba(100,200,100,0.7)", marginBottom: 5 }}>
                  Safe default: <code style={{ ...MONO }}>{field.defaultValue}</code>
                </div>
              )}
              <input
                type={field.sensitivity === "secret" ? "password" : "text"}
                value={field.value}
                onChange={e => setEnvFields(prev => prev.map(f => f.name === field.name ? { ...f, value: e.target.value } : f))}
                placeholder={field.sensitivity === "secret" ? "Enter secret value" : field.defaultValue ? `Default: ${field.defaultValue}` : `Enter value`}
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "7px 10px",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  color: "rgba(255,255,255,0.85)",
                  ...MONO,
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
          ))}
          {effectiveEnvFields.length === 0 && serviceBindings.size === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, fontStyle: "italic" }}>
              No additional configuration required.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={BTN_PRIMARY} onClick={handleConfigDone}>Continue</button>
            <button type="button" style={BTN_GHOST} onClick={() => setPhase("decision")}>Cancel</button>
          </div>
        </>
      )}

      {phase === "confirming" && (
        <>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 16, lineHeight: 1.6 }}>
            Atlas will install this repository's dependencies and run its declared development command inside the project workspace.
          </div>
          <div style={{ marginBottom: 14, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 7, ...MONO, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            <div>{selectedTarget.installCommand}</div>
            <div>{selectedTarget.startCommand}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={BTN_PRIMARY} onClick={handleConfirmedRun}>Run this app</button>
            <button type="button" style={BTN_GHOST} onClick={() => setPhase("decision")}>Cancel</button>
          </div>
        </>
      )}

      {phase === "polling" && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>
            {serverStatus?.status === "restarting" ? "Restarting" : "Preparing"} {selectedTarget.workingDirectory}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4, ...MONO }}>
            {serverStatus?.status === "installing"
              ? "Installing dependencies…"
              : serverStatus?.status === "starting"
                ? "Starting application…"
                : serverStatus?.status === "restarting"
                  ? "Restarting — waiting for connection…"
                  : "Waiting for connection…"}
          </div>
          <StepList serverStatus={serverStatus} selectedTargetId={selectedTargetId} />
          <button type="button" style={{ ...BTN_GHOST, marginTop: 6, fontSize: 11 }} onClick={handleStop}>
            Cancel
          </button>
        </>
      )}

      {phase === "connected" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
              {selectedTarget.workingDirectory} is running
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ ...BADGE, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}>
              {selectedTarget.framework}
            </span>
            {serverStatus?.port && (
              <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>port {serverStatus.port}</span>
            )}
            <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {relativeTime(serverStatus?.verifiedAt ?? null)}
            </span>
          </div>
          <ReadinessBadges readiness={serverStatus?.readiness} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: runtimeEvents.length > 0 ? 10 : 0 }}>
            <button type="button" style={BTN_PRIMARY} onClick={handleOpenPreview}>Open preview</button>
            <button type="button" style={BTN_GHOST} onClick={handleRestart}>Restart</button>
            <button type="button" style={BTN_GHOST} onClick={() => setShowLogs(v => !v)}>
              {showLogs ? "Hide logs" : "Logs"}
            </button>
            <button type="button" style={BTN_GHOST} onClick={() => setShowHistory(v => !v)}>
              {showHistory ? "Hide history" : "History"}
            </button>
            <button type="button" style={BTN_DANGER} onClick={handleStop}>Stop</button>
          </div>
          {showHistory && runtimeEvents.length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 7, display: "flex", flexDirection: "column", gap: 4 }}>
              {runtimeEvents.slice(0, 8).map((ev) => (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{eventTypeLabel(ev.event_type)}</span>
                  <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{relativeTime(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {phase === "crashed" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
              {selectedTarget.workingDirectory} crashed
            </span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12, lineHeight: 1.5 }}>
            {serverStatus?.errorMsg ?? "The app exited unexpectedly. It was running when it stopped."}
          </div>
          {runtimeEvents.length > 0 && (
            <div style={{ marginBottom: 12, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 7, display: "flex", flexDirection: "column", gap: 4 }}>
              {runtimeEvents.slice(0, 5).map((ev) => (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{eventTypeLabel(ev.event_type)}</span>
                  <span style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{relativeTime(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={BTN_PRIMARY} onClick={handleRestart}>Restart</button>
            {hasRequiredConfig && (
              <button type="button" style={BTN_GHOST} onClick={() => setPhase("configuring")}>Reconfigure</button>
            )}
            <button type="button" style={BTN_GHOST} onClick={() => setShowLogs(v => !v)}>
              {showLogs ? "Hide logs" : "View logs"}
            </button>
            <button type="button" style={BTN_GHOST} onClick={() => setPhase("decision")}>Back</button>
          </div>
        </>
      )}

      {phase === "error" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
              {selectedTarget.workingDirectory} could not start
            </span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 10, lineHeight: 1.5 }}>
            {serverStatus?.errorMsg ?? "The application exited before accepting an HTTP connection."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasRequiredConfig && (
              <button type="button" style={BTN_PRIMARY} onClick={() => setPhase("configuring")}>Add configuration</button>
            )}
            <button type="button" style={BTN_GHOST} onClick={() => setShowLogs(v => !v)}>
              {showLogs ? "Hide logs" : "View logs"}
            </button>
            <button type="button" style={BTN_GHOST} onClick={() => setPhase("decision")}>Try again</button>
          </div>
        </>
      )}

      {showLogs && serverStatus?.logs && serverStatus.logs.length > 0 && (
        <div style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "rgba(0,0,0,0.35)",
          borderRadius: 8,
          maxHeight: 200,
          overflowY: "auto",
          ...MONO,
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.6,
        }}>
          {serverStatus.logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {showLogs && (!serverStatus?.logs || serverStatus.logs.length === 0) && (
        <div style={{ marginTop: 10, ...MONO, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          No logs available yet.
        </div>
      )}
    </div>
  );
}
