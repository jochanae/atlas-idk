/**
 * Atlas service capability registry — Phase 4.
 *
 * Product-capability table: kept entirely separate from the static classifier.
 * The classifier discovers WHAT services a repository uses; this registry
 * declares HOW Atlas can help connect them. These are two different concerns.
 *
 * To add a new provider: add a ServiceCapability entry here.
 * No classifier changes are required.
 *
 * Security invariant:
 *   Only `provisionMode: "atlas-managed"` and `provisionMode: "local"` may be
 *   self-serviced. For `provisionMode: "existing-connection"`, the user supplies
 *   a secret, which the server encrypts and stores — the value NEVER returns to
 *   the browser. The browser receives only a `bindingId`.
 */

export type ServiceId =
  | "postgresql"
  | "mysql"
  | "mongodb"
  | "redis"
  | "sqlite";

export type ProvisionMode =
  /** Atlas creates and manages an isolated instance on behalf of the project. */
  | "atlas-managed"
  /**
   * User provides an external connection string.
   * Atlas encrypts it and injects it server-side — it never returns to the browser.
   * Correct UX: "Enter your PostgreSQL connection string" → secret cleared after POST.
   */
  | "existing-connection"
  /**
   * No external service required.
   * Atlas generates a project-local resource (e.g. a SQLite file path).
   * The generated value is a safe relative path, not a credential.
   */
  | "local"
  /** Atlas has no provisioning support. User must configure manually. */
  | "unsupported";

export type ServiceCapability = {
  serviceId: ServiceId;
  /** Human-readable display name shown in the card UI. */
  displayName: string;
  provisionMode: ProvisionMode;
  /**
   * Env var names this service typically provides when provisioned.
   * Used to pre-populate binding metadata and filter the manual env form.
   */
  knownEnvVars: string[];
  /** Short label shown after provisioning (e.g. "your PostgreSQL provider"). */
  providerLabel?: string;
};

export const ATLAS_SERVICE_CAPABILITIES: Record<ServiceId, ServiceCapability> = {
  postgresql: {
    serviceId: "postgresql",
    displayName: "PostgreSQL",
    /**
     * "existing-connection" — not "atlas-managed".
     *
     * Replit provides one DATABASE_URL for the Atlas API-server itself. That
     * credential belongs to Atlas's application database and must NEVER be
     * returned to the browser or injected into user project processes.
     *
     * Until Atlas can provision isolated per-project PostgreSQL instances
     * (e.g. via Neon or Supabase), the correct mode is "existing-connection":
     * the user provides their own connection string, Atlas encrypts it.
     * Flip to "atlas-managed" only when isolated project credentials exist.
     */
    provisionMode: "existing-connection",
    knownEnvVars: ["DATABASE_URL"],
    providerLabel: "your PostgreSQL provider",
  },
  sqlite: {
    serviceId: "sqlite",
    displayName: "SQLite",
    /**
     * "local" — SQLite is a file on disk, not an external service.
     * Atlas generates a safe project-relative path (file:./data/app.db).
     * The path is not a credential and may be shown in the UI.
     * The /run route injects it only if the target declared DATABASE_URL.
     */
    provisionMode: "local",
    knownEnvVars: ["DATABASE_URL"],
    providerLabel: "local database file",
  },
  mysql: {
    serviceId: "mysql",
    displayName: "MySQL",
    provisionMode: "unsupported",
    knownEnvVars: ["DATABASE_URL"],
  },
  mongodb: {
    serviceId: "mongodb",
    displayName: "MongoDB",
    provisionMode: "unsupported",
    knownEnvVars: ["MONGODB_URI", "MONGO_URL"],
  },
  redis: {
    serviceId: "redis",
    displayName: "Redis",
    provisionMode: "unsupported",
    knownEnvVars: ["REDIS_URL", "REDIS_URI"],
  },
};

/**
 * Normalize a freeform service name (from package.json, display string, etc.)
 * to a canonical ServiceId. Case-insensitive. Returns null if unrecognised.
 *
 * This is the single canonical mapping — all code should go through here rather
 * than pattern-matching on display strings like "PostgreSQL" or "Postgres".
 */
export function normalizeServiceId(name: string): ServiceId | null {
  const lower = name.toLowerCase().trim();
  const MAP: Record<string, ServiceId> = {
    postgresql: "postgresql",
    postgres: "postgresql",
    pg: "postgresql",
    mysql: "mysql",
    mariadb: "mysql",
    mongodb: "mongodb",
    mongo: "mongodb",
    redis: "redis",
    ioredis: "redis",
    "@upstash/redis": "redis",
    sqlite: "sqlite",
    "better-sqlite3": "sqlite",
    libsql: "sqlite",
    "@libsql/client": "sqlite",
  };
  return MAP[lower] ?? null;
}
