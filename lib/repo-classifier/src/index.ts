export { classifyRepository } from "./staticClassifier.js";
export { ATLAS_SERVICE_CAPABILITIES, normalizeServiceId } from "./capabilities.js";
export type { ServiceCapability, ServiceId, ProvisionMode } from "./capabilities.js";
export type {
  ClassificationLimits,
  EnvironmentRequirement,
  EvidenceItem,
  ExternalServiceRequirement,
  Recommendation,
  RepositoryClassificationInput,
  RepositoryFile,
  RepositoryRunabilityReport,
  RunnableTarget,
  RunnableTargetStatus,
  SystemDependency,
} from "./types.js";
export { DEFAULT_CLASSIFICATION_LIMITS } from "./types.js";
