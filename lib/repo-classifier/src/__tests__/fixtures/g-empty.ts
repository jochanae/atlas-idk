import type { RepositoryClassificationInput } from "../../types.js";

/**
 * Fixture G — No files at all (empty workspace, no GitHub link).
 *
 * Expected:
 *   - overallStatus "ambiguous"
 *   - targets []
 *   - warnings includes "No file tree available"
 */
export const fixtureEmpty: RepositoryClassificationInput = {
  sourceMode: "local-complete",
  files: [],
};
