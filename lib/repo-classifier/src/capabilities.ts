/**
 * Atlas service capability registry — Phase 4.
 *
 * This is a product-capability table, NOT repository evidence.
 * The static classifier never sets these fields. They are merged into
 * ExternalServiceRequirement entries AFTER classification, in the API layer.
 *
 * To add a new provider: add an entry here. No classifier changes needed.
 */

export type ServiceCapability = {
  /** Atlas can provision an instance of this service automatically. */
  atlasCanProvide: boolean;
  /** Atlas can produce a working connection string after provisioning. */
  atlasCanConnect: boolean;
  /** Env var names Atlas injects when it provisions this service. */
  provisionedEnvVars: string[];
  /** Short label shown in the card UI (e.g. "Replit PostgreSQL"). */
  providerLabel?: string;
};

export const ATLAS_SERVICE_CAPABILITIES: Record<string, ServiceCapability> = {
  PostgreSQL: {
    atlasCanProvide: true,
    atlasCanConnect: true,
    provisionedEnvVars: ["DATABASE_URL"],
    providerLabel: "Replit PostgreSQL",
  },
  SQLite: {
    atlasCanProvide: true,
    atlasCanConnect: true,
    provisionedEnvVars: [],
    providerLabel: "local file — no connection string needed",
  },
  MySQL: {
    atlasCanProvide: false,
    atlasCanConnect: false,
    provisionedEnvVars: [],
  },
  MongoDB: {
    atlasCanProvide: false,
    atlasCanConnect: false,
    provisionedEnvVars: [],
  },
  Redis: {
    atlasCanProvide: false,
    atlasCanConnect: false,
    provisionedEnvVars: [],
  },
};
