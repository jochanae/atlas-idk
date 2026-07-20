import type { RepositoryFile, EnvironmentRequirement, EvidenceItem } from "../types.js";

// ── Files that must NEVER be scanned for content ──────────────────────────────
const FORBIDDEN_ENV_SOURCES = /^(\.env|\.env\.local|\.env\.development|\.env\.production|\.env\.staging|\.env\.test)$/;
const ALLOWED_ENV_TEMPLATES = /\.(example|sample|template)$/;

/** Returns true if this file path is a safe env template file. */
function isSafeEnvTemplate(path: string): boolean {
  const basename = path.split("/").pop() ?? "";
  return /^\.env/.test(basename) && ALLOWED_ENV_TEMPLATES.test(basename);
}

/** Returns true if this file path is a forbidden real env file. */
function isForbiddenEnvFile(path: string): boolean {
  const basename = path.split("/").pop() ?? "";
  return FORBIDDEN_ENV_SOURCES.test(basename);
}

// ── Secret name heuristic ─────────────────────────────────────────────────────

const SECRET_NAME_PATTERNS = [
  /_KEY$/i, /_SECRET$/i, /_TOKEN$/i, /_PASSWORD$/i, /_PASS$/i,
  /^PRIVATE_/i, /_PRIVATE$/i, /_CREDENTIAL/i, /_AUTH$/i,
  /SESSION_SECRET/i, /JWT_SECRET/i, /API_KEY/i,
  // Database / service connection URLs always carry embedded credentials
  /DATABASE_URL/i, /DB_URL/i, /MONGO(?:DB)?_URI/i, /REDIS_URL/i,
  /POSTGRES(?:QL)?_URL/i, /MYSQL_URL/i, /CONNECTION_STRING/i,
  /_URI$/i, /_DSN$/i,
];

export function classifySecretSensitivity(name: string): "secret" | "public" | "unknown" {
  if (SECRET_NAME_PATTERNS.some((re) => re.test(name))) return "secret";
  if (name.startsWith("NEXT_PUBLIC_") || name.startsWith("VITE_") || name.startsWith("PUBLIC_")) return "public";
  return "unknown";
}

// ── Boot requirement heuristic ────────────────────────────────────────────────

/**
 * DATABASE_URL is classified as required-to-boot because ORM/DB clients
 * initialize at import time in most frameworks.
 */
const BOOT_REQUIRED_PATTERNS = [
  /DATABASE_URL/i, /DB_URL/i, /POSTGRES(?:_URL|QL_URL)?/i, /MONGO(?:DB)?_URI/i,
  /REDIS_URL/i, /SESSION_SECRET/i, /JWT_SECRET/i, /ENCRYPTION_KEY/i,
  /NEXTAUTH_SECRET/i, /NEXTAUTH_URL/i,
];

const FEATURE_ONLY_PATTERNS = [
  /_API_KEY$/i, /RESEND_/i, /SENDGRID_/i, /MAILGUN_/i, /TWILIO_/i,
  /STRIPE_/i, /PAYPAL_/i, /PUSHER_/i, /ALGOLIA_/i, /SENTRY_/i,
  /ANALYTICS_/i, /MIXPANEL_/i, /SEGMENT_/i, /INTERCOM_/i,
  /SLACK_WEBHOOK/i, /DISCORD_WEBHOOK/i,
];

export function classifyBootRequirement(
  name: string,
): "required-to-boot" | "required-for-feature" | "optional" {
  if (BOOT_REQUIRED_PATTERNS.some((re) => re.test(name))) return "required-to-boot";
  if (FEATURE_ONLY_PATTERNS.some((re) => re.test(name))) return "required-for-feature";
  return "optional";
}

// ── Env var extraction ─────────────────────────────────────────────────────────

function extractFromEnvTemplate(content: string, source: string): Map<string, { source: string[] }> {
  const vars = new Map<string, { source: string[] }>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    if (/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      const existing = vars.get(name) ?? { source: [] };
      existing.source.push(source);
      vars.set(name, existing);
    }
  }
  return vars;
}

function extractFromSourceCode(content: string, source: string): string[] {
  const names: string[] = [];
  // process.env.NAME or process.env["NAME"]
  const processEnvRe = /process\.env\.([A-Z_][A-Z0-9_]*)|process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]]/g;
  for (const m of content.matchAll(processEnvRe)) {
    const name = m[1] ?? m[2];
    if (name) names.push(name);
  }
  // import.meta.env.NAME
  const metaEnvRe = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;
  for (const m of content.matchAll(metaEnvRe)) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

// ── Public API ─────────────────────────────────────────────────────────────────

const SOURCE_CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

export function scanEnvVars(
  files: RepositoryFile[],
): { requirements: EnvironmentRequirement[]; evidence: EvidenceItem[] } {
  const evidence: EvidenceItem[] = [];
  const varMap = new Map<string, Set<string>>(); // name → sources

  for (const file of files) {
    const basename = file.path.split("/").pop() ?? "";

    // Hard skip: never scan real env files
    if (isForbiddenEnvFile(file.path)) continue;

    // Safe env templates: extract names from KEY=value lines
    if (isSafeEnvTemplate(file.path)) {
      if (!file.content) continue;
      const extracted = extractFromEnvTemplate(file.content, file.path);
      for (const [name, { source }] of extracted) {
        const existing = varMap.get(name) ?? new Set<string>();
        for (const s of source) existing.add(s);
        varMap.set(name, existing);
      }
      evidence.push({ type: "detected", description: `env template scanned: ${file.path}`, source: file.path });
      continue;
    }

    // Source code: scan for process.env / import.meta.env references
    if (SOURCE_CODE_EXTENSIONS.test(basename) && file.content) {
      const names = extractFromSourceCode(file.content, file.path);
      for (const name of names) {
        const existing = varMap.get(name) ?? new Set<string>();
        existing.add(file.path);
        varMap.set(name, existing);
      }
    }
  }

  const requirements: EnvironmentRequirement[] = [];
  for (const [name, sourcePaths] of varMap) {
    const sensitivity = classifySecretSensitivity(name);
    const classification = classifyBootRequirement(name);
    const req: EnvironmentRequirement = {
      name,
      classification,
      sensitivity,
      source: [...sourcePaths],
    };
    // Only add defaultValue for public + has-default (we don't track defaults yet)
    // INVARIANT: never add defaultValue when sensitivity === "secret"
    requirements.push(req);
  }

  return { requirements, evidence };
}
