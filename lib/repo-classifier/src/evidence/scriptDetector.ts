import type { WorkspacePackage, WorkspaceInfo } from "./workspaceDiscovery.js";

/** Script keys that indicate a package has a runnable web/server process. */
export const RUNNABLE_SCRIPT_KEYS = [
  "dev",
  "start",
  "serve",
  "develop",
  "web",
  "start:dev",
  "dev:server",
  "preview",
] as const;

export type DetectedScript = {
  key: string;
  command: string;
};

/**
 * Find the best recognized runnable script for a package.
 * Returns null when none is found.
 */
export function detectRunnableScript(
  pkg: WorkspacePackage,
  workspace: WorkspaceInfo,
): DetectedScript | null {
  const scripts = (pkg.packageJson.scripts as Record<string, unknown> | undefined) ?? {};

  // Check own scripts in priority order
  for (const key of RUNNABLE_SCRIPT_KEYS) {
    if (typeof scripts[key] === "string") {
      return { key, command: scripts[key] as string };
    }
  }

  // Check if root orchestration references this package
  const name = pkg.packageJson.name as string | undefined;
  const dir = pkg.directory;
  const lastName = dir.split("/").pop() ?? "";
  if (
    workspace.rootFilterRefs.some(
      (ref) => ref === name || ref === dir || (lastName && ref.endsWith(`/${lastName}`)),
    )
  ) {
    // Root drives this package — treat it as having an implicit dev script
    return { key: "dev", command: "(via workspace root orchestration)" };
  }

  return null;
}

/**
 * Returns the install command to use based on the lockfile detected in
 * the package's owned files.
 */
export function detectInstallCommand(pkg: WorkspacePackage): string {
  const paths = pkg.ownedFiles.map((f) => f.path);
  if (paths.some((p) => p.endsWith("pnpm-lock.yaml"))) return "pnpm install";
  if (paths.some((p) => p.endsWith("yarn.lock"))) return "yarn";
  if (paths.some((p) => p.endsWith("bun.lockb"))) return "bun install";
  return "npm install";
}
