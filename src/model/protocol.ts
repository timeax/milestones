export const MILESTONE_PROTOCOL_VERSION = "1.1" as const;
export type MilestoneProtocolVersion = typeof MILESTONE_PROTOCOL_VERSION;
export const ARTIFACT_PACKAGE_COMPATIBILITY = ">=0.2.0 <0.3.0" as const;
export const ARTIFACT_PROTOCOL_COMPATIBILITY = ">=1.1 <2.0" as const;
export { ARTIFACT_PROTOCOL_VERSION } from "@elqora/artifacts";
export type {
  Artifact,
  ArtifactId,
  ArtifactVersion,
  ArtifactVersionId,
  ArtifactLink,
  ArtifactLinkId,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubmission,
  ArtifactSubmissionId,
  ArtifactVerification,
  ArtifactVerificationId,
} from "@elqora/artifacts";
