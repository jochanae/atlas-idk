// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * A single file from the repository.
 * content is absent when the source was a GitHub path-only tree and
 * the file was not individually fetched.
 */
export type RepositoryFile = {
  path: string;
  content?: string;
};

/**
 * All input the classifier needs. No I/O is performed inside classifyRepository().
 * The route layer (via a source adapter) is responsible for populating this.
 */
export type RepositoryClassificationInput = {
  /** Informational only — the classifier never uses this for path resolution. */
  repositoryRoot?: string;
  files: RepositoryFile[];
  /**
   * local-complete  — workspace is cloned; all required files were loaded from disk.
   * github-partial  — GitHub API path list; only selected files were fetched.
   *                   Report confidence cannot exceed "medium" in this mode.
   */
  sourceMode: "local-complete" | "github-partial";
  metadata?: {
    /**
     * Optional commit activity per package directory (relative path from repo root).
     * When absent, commit age is not counted positively or negatively.
     * A target is never marked inactive solely because this is missing.
     */
    packageActivity?: Record<
      string,
      {
        lastCommitAt?: string;
        source: "github-api" | "git-history";
      }
    >;
  };
};

// ── Evidence ──────────────────────────────────────────────────────────────────

export type EvidenceItem = {
  /**
   * detected           — a file or pattern was found
   * inferred           — a conclusion drawn from detected evidence
   * failed-verification — an expected file or pattern was absent
   *
   * Note: "verified" is a Phase 2 runtime status. It is never emitted by
   * the static classifier.
   */
  type: "detected" | "inferred" | "failed-verification";
  description: string;
  /** The file path or field reference that produced this evidence, e.g. "vite.config.ts" */
  source: string;
};

// ── Environment ───────────────────────────────────────────────────────────────

export type EnvironmentRequirement = {
  name: string;
  classification: "required-to-boot" | "required-for-feature" | "optional" | "has-default";
  sensitivity: "secret" | "public" | "unknown";
  /** File paths where this variable name was found — never actual .env files. */
  source: string[];
  /**
   * Only present for public + has-default variables.
   * INVARIANT: must be absent when sensitivity === "secret".
   */
  defaultValue?: string;
};

// ── External services ─────────────────────────────────────────────────────────

export type ExternalServiceRequirement = {
  service: string;
  evidence: string;
  /**
   * environment-configurable — can be supplied via env var; Atlas can prompt the user.
   * unknown                  — no known env-var pattern found for this service.
   *
   * Note: Atlas product-capability fields (atlasCanProvide, atlasCanConnect) are
   * intentionally excluded. Those belong in a separate capability registry, not
   * in repository evidence.
   */
  connectionSupport: "environment-configurable" | "unknown";
};

// ── System dependencies ────────────────────────────────────────────────────────

export type SystemDependency = {
  name: string;
  evidence: string;
};

// ── Runnable target ───────────────────────────────────────────────────────────

export type RunnableTargetStatus =
  /**
   * Static evidence is consistent with this target being runnable.
   * CEILING for Phase 1 — "verified-runnable" is a Phase 2 runtime status.
   */
  | "likely-runnable"
  /** Needs env vars or configuration supplied before it can start. */
  | "configuration-required"
  /** Requires a running external service (database, cache, etc.). */
  | "external-service-required"
  /** Evidence suggests this package has been abandoned or superseded. */
  | "likely-inactive"
  /** Evidence is present but inconclusive. */
  | "ambiguous"
  /** Mobile app, Docker-only, or otherwise not previewable in Atlas. */
  | "unsupported";

export type RunnableTarget = {
  /** Stable identifier, e.g. "frontend-artifacts-atlas-frontend" */
  id: string;
  role: "frontend" | "api" | "worker" | "fullstack" | "unknown";
  /** Relative from the repository root, e.g. "artifacts/atlas-frontend" */
  workingDirectory: string;
  /** e.g. "pnpm install" */
  installCommand: string;
  /** e.g. "npm run build" — absent when no separate build step detected */
  buildCommand?: string;
  /** e.g. "npm run dev" */
  startCommand: string;
  expectedPort?: number;
  /** Human-readable, e.g. "Vite + React", "Next.js", "Node/Express" */
  framework: string;
  /** Package names only — no versions. */
  dependencies: string[];
  /** e.g. ["PostgreSQL", "Redis"] */
  externalServices: string[];
  /** Variable names only — values never enter this field. */
  environmentVariables: string[];
  status: RunnableTargetStatus;
  confidence: "high" | "medium" | "low";
  evidence: EvidenceItem[];
  /** Populated when status === "likely-inactive" */
  inactivityReasons?: string[];
};

// ── Recommendation ────────────────────────────────────────────────────────────

export type Recommendation = {
  targetId: string;
  /** Human-readable explanation of why this target was chosen. */
  reasons: string[];
  evidence: EvidenceItem[];
};

// ── Report ────────────────────────────────────────────────────────────────────

export type RepositoryRunabilityReport = {
  repositoryType: "single-app" | "monorepo" | "library" | "mobile" | "mixed" | "unknown";
  /**
   * Mirrors the input sourceMode.
   * github-partial caps report confidence at "medium".
   */
  sourceMode: "local-complete" | "github-partial";
  targets: RunnableTarget[];
  /** Set when a recommended target can be identified. */
  recommendation?: Recommendation;
  requirements: {
    environmentVariables: EnvironmentRequirement[];
    externalServices: ExternalServiceRequirement[];
    systemDependencies: SystemDependency[];
  };
  previewStrategy: "local-runtime" | "existing-url" | "static-render" | "unsupported";
  /**
   * Derived from the recommended target's status — not from the worst-case target.
   * Unsupported or inactive sibling targets add warnings but never override this.
   *
   * Mapping from recommended target:
   *   likely-runnable            → "ready"
   *   configuration-required     → "configuration-required"
   *   external-service-required  → "external-service-required"
   *   (no recommended target, only ambiguous) → "ambiguous"
   *   (no supported runnable target at all)   → "unsupported"
   */
  overallStatus:
    | "ready"
    | "configuration-required"
    | "external-service-required"
    | "unsupported"
    | "ambiguous";
  confidence: "high" | "medium" | "low";
  evidence: EvidenceItem[];
  warnings: string[];
};

// ── Limits ────────────────────────────────────────────────────────────────────

export type ClassificationLimits = {
  /** Maximum number of files to include from the repository. Default: 500 */
  maxFiles: number;
  /** Maximum total bytes across all file contents. Default: 5_242_880 (5 MB) */
  maxTotalBytes: number;
  /** Maximum bytes for any single file. Default: 262_144 (256 KB) */
  maxFileBytes: number;
  /** Maximum number of candidate packages to evaluate. Default: 20 */
  maxPackages: number;
};

export const DEFAULT_CLASSIFICATION_LIMITS: ClassificationLimits = {
  maxFiles: 500,
  maxTotalBytes: 5_242_880,
  maxFileBytes: 262_144,
  maxPackages: 20,
};
