import type { RepositoryFile, ExternalServiceRequirement } from "../types.js";
import type { WorkspacePackage } from "./workspaceDiscovery.js";

type ServicePattern = {
  service: string;
  packageNames: string[];
  importPatterns?: RegExp[];
  connectionSupport: "environment-configurable" | "unknown";
};

const SERVICE_PATTERNS: ServicePattern[] = [
  {
    service: "PostgreSQL",
    packageNames: ["pg", "postgres", "@prisma/client", "drizzle-orm", "knex", "sequelize", "typeorm"],
    importPatterns: [/from ['"]pg['"]/, /from ['"]postgres['"]/, /from ['"]@prisma\/client['"]/],
    connectionSupport: "environment-configurable",
  },
  {
    service: "MySQL",
    packageNames: ["mysql", "mysql2", "mariadb"],
    connectionSupport: "environment-configurable",
  },
  {
    service: "MongoDB",
    packageNames: ["mongoose", "mongodb"],
    connectionSupport: "environment-configurable",
  },
  {
    service: "Redis",
    packageNames: ["redis", "ioredis", "@upstash/redis"],
    connectionSupport: "environment-configurable",
  },
  {
    service: "SQLite",
    packageNames: ["better-sqlite3", "@libsql/client", "libsql"],
    connectionSupport: "environment-configurable",
  },
];

function hasDep(pkg: WorkspacePackage, name: string): boolean {
  const deps = {
    ...(pkg.packageJson.dependencies as Record<string, unknown> | undefined ?? {}),
    ...(pkg.packageJson.devDependencies as Record<string, unknown> | undefined ?? {}),
  };
  return name in deps;
}

export function detectExternalServices(
  pkg: WorkspacePackage,
  allFiles: RepositoryFile[],
): ExternalServiceRequirement[] {
  const detected: ExternalServiceRequirement[] = [];

  for (const pattern of SERVICE_PATTERNS) {
    const matchedPkg = pattern.packageNames.find((name) => hasDep(pkg, name));
    if (matchedPkg) {
      detected.push({
        service: pattern.service,
        evidence: `${matchedPkg} found in package.json dependencies`,
        connectionSupport: pattern.connectionSupport,
      });
      continue;
    }

    // Check import patterns in source files if provided
    if (pattern.importPatterns) {
      const prefix = pkg.directory ? pkg.directory + "/" : "";
      const pkgSourceFiles = allFiles.filter(
        (f) => f.path.startsWith(prefix) && /\.(ts|tsx|js|jsx)$/.test(f.path) && f.content,
      );
      for (const file of pkgSourceFiles) {
        const hit = pattern.importPatterns.find((re) => re.test(file.content!));
        if (hit) {
          detected.push({
            service: pattern.service,
            evidence: `import detected in ${file.path}`,
            connectionSupport: pattern.connectionSupport,
          });
          break;
        }
      }
    }
  }

  // Deduplicate by service name
  const seen = new Set<string>();
  return detected.filter((d) => {
    if (seen.has(d.service)) return false;
    seen.add(d.service);
    return true;
  });
}
