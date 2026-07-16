import { Check, Shield, AlertTriangle } from "lucide-react";

export interface BuildContractStep {
  id: string;
  sequence: number;
  title: string;
  targetFiles: string[];
  requiredEvidence: string[];
  maxFiles?: number;
  maxPatchLines?: number;
}

export interface BuildContractData {
  runId: string;
  planVersion: string;
  authorizationPolicy: string;
  buildType?: string;
  atomicPolicy?: string;
  estimatedAtomicSteps?: number;
  expectedSurfaces?: string[];
  changesExpected?: boolean;
  previewDestination?: string | null;
  localDevExpected?: boolean;
  iterationStrategy?: string;
  verificationCriteria?: string;
  rollbackTarget?: string | null;
  steps: BuildContractStep[];
}

interface BuildContractCardProps {
  contract: BuildContractData;
  onAuthorize: () => void;
  onRevise: () => void;
  onCancel: () => void;
  isAuthorizing?: boolean;
}

function policyLabel(policy: string): string {
  if (policy === "destructive-confirmation-required") return "Destructive — confirmation required";
  if (policy === "external-write-confirmation-required") return "External write — confirmation required";
  if (policy === "request-itself-authorizes") return "Self-authorized";
  return "Confirmation required";
}

function policyColor(policy: string): string {
  if (policy === "destructive-confirmation-required") return "var(--atlas-ember)";
  if (policy === "external-write-confirmation-required") return "var(--atlas-gold)";
  return "var(--atlas-phosphor)";
}

export function BuildContractCard({
  contract,
  onAuthorize,
  onRevise,
  onCancel,
  isAuthorizing = false,
}: BuildContractCardProps) {
  const accent = "var(--atlas-gold)";
  const color = policyColor(contract.authorizationPolicy);
  const isDestructive = contract.authorizationPolicy === "destructive-confirmation-required";

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--atlas-surface)",
        border: `1px solid color-mix(in oklab, ${accent} 20%, var(--atlas-border))`,
        borderLeft: `3px solid ${accent}`,
        boxShadow: `0 14px 36px -28px ${accent}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: accent,
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              Build Plan
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                borderRadius: 999,
                padding: "2px 7px",
                fontFamily: "var(--app-font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color,
                background: `color-mix(in oklab, ${color} 10%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 24%, transparent)`,
              }}
            >
              {isDestructive ? <AlertTriangle size={9} /> : <Shield size={9} />}
              {policyLabel(contract.authorizationPolicy)}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {contract.buildType && (
              <span
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9.5,
                  color: "var(--atlas-muted)",
                  opacity: 0.72,
                }}
              >
                {contract.buildType === "artifact-only" ? "Artifact generation" : "Project files"}
              </span>
            )}
            {contract.changesExpected && (
              <span
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9.5,
                  color: "var(--atlas-muted)",
                  opacity: 0.65,
                }}
              >
                · changes expected
              </span>
            )}
            {contract.localDevExpected && (
              <span
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9.5,
                  color: "var(--atlas-muted)",
                  opacity: 0.65,
                }}
              >
                · local dev
              </span>
            )}
            {contract.rollbackTarget && (
              <span
                style={{
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  color: "var(--atlas-phosphor)",
                  opacity: 0.8,
                }}
                title={`Rollback snapshot: ${contract.rollbackTarget}`}
              >
                · snapshot ready
              </span>
            )}
          </div>
        </div>
      </div>

      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 12px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        {contract.steps.map((step) => (
          <li
            key={step.id}
            style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
                color: "var(--atlas-muted)",
                background: "var(--atlas-bg)",
                border: "1px solid var(--atlas-border)",
                fontFamily: "var(--app-font-mono)",
                fontSize: 8,
              }}
            >
              {step.sequence}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--atlas-fg)",
                  lineHeight: 1.45,
                }}
              >
                {step.title}
              </span>
              {step.targetFiles.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  {step.targetFiles.slice(0, 4).map((f) => (
                    <span
                      key={f}
                      style={{
                        fontFamily: "var(--app-font-mono)",
                        fontSize: 9,
                        color: "var(--atlas-gold)",
                        opacity: 0.85,
                        background:
                          "color-mix(in oklab, var(--atlas-gold) 8%, transparent)",
                        borderRadius: 3,
                        padding: "1px 5px",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={f}
                    >
                      {f.split("/").pop() ?? f}
                    </span>
                  ))}
                  {step.targetFiles.length > 4 && (
                    <span
                      style={{
                        fontFamily: "var(--app-font-mono)",
                        fontSize: 9,
                        color: "var(--atlas-muted)",
                        opacity: 0.6,
                      }}
                    >
                      +{step.targetFiles.length - 4} more
                    </span>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {contract.verificationCriteria && (
        <div
          style={{
            marginBottom: 10,
            padding: "6px 9px",
            borderRadius: 6,
            background: "color-mix(in oklab, var(--atlas-muted) 6%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--atlas-muted) 14%, transparent)",
            fontFamily: "var(--app-font-mono)",
            fontSize: 9.5,
            color: "var(--atlas-muted)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ opacity: 0.6, marginRight: 5 }}>Verified when:</span>
          {contract.verificationCriteria}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isAuthorizing}
          style={{
            padding: "7px 10px",
            borderRadius: 7,
            background: "transparent",
            border: "none",
            color: "var(--atlas-muted)",
            cursor: "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: isAuthorizing ? 0.4 : 0.7,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onRevise}
          disabled={isAuthorizing}
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 7,
            background: "transparent",
            border: "1px solid var(--atlas-border)",
            color: "var(--atlas-muted)",
            cursor: "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: isAuthorizing ? 0.4 : 1,
          }}
        >
          Revise
        </button>
        <button
          type="button"
          onClick={onAuthorize}
          disabled={isAuthorizing}
          style={{
            flex: 1.4,
            padding: "7px 10px",
            borderRadius: 7,
            background: isDestructive
              ? "linear-gradient(180deg, var(--atlas-ember) 0%, color-mix(in oklab, var(--atlas-ember) 78%, var(--atlas-bg)) 100%)"
              : "linear-gradient(180deg, var(--atlas-gold) 0%, color-mix(in oklab, var(--atlas-gold) 78%, var(--atlas-bg)) 100%)",
            border: `1px solid ${isDestructive ? "var(--atlas-ember)" : "var(--atlas-gold)"}`,
            color: "var(--atlas-bg)",
            cursor: isAuthorizing ? "wait" : "pointer",
            fontFamily: "var(--app-font-mono)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            opacity: isAuthorizing ? 0.7 : 1,
          }}
        >
          {isAuthorizing ? (
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  border: "1.5px solid var(--atlas-bg)",
                  borderTopColor: "transparent",
                  animation: "atlas-spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              Authorizing…
            </>
          ) : (
            <>
              <Check size={10} />
              Authorize Build
            </>
          )}
        </button>
      </div>
      <style>{`
        @keyframes atlas-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
