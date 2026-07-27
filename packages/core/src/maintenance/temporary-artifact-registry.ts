import type { TemporaryArtifactLifecycleManifest } from "./temporary-artifact-lifecycle.js"

export const TEMPORARY_ARTIFACT_LIFECYCLES: readonly TemporaryArtifactLifecycleManifest[] = [
  {
    artifactId: "packages/core/src/channels/access-policy.ts#legacy-user-message-field",
    kind: "temporary_compatibility",
    ownerId: "owner:channel-final-response",
    createdVersion: "compat:access-policy:v1",
    expiryCondition: {
      conditionId: "all-channel-callers-use-notice",
      satisfied: false,
      evidenceRefs: ["source:channels/access-policy.ts"],
    },
    removalCondition: {
      conditionId: "legacy-user-message-consumers-zero",
      satisfied: false,
      evidenceRefs: ["test:channel-notice-provenance"],
    },
    activeConsumerIds: ["consumer:legacy-channel-adapters"],
  },
  {
    artifactId: "packages/core/src/contracts/sub-agent-orchestration.ts#legacy-limit-metadata",
    kind: "temporary_compatibility",
    ownerId: "owner:sub-agent-contract",
    createdVersion: "compat:sub-agent-limit:v1",
    expiryCondition: {
      conditionId: "legacy-limit-payloads-migrated",
      satisfied: false,
      evidenceRefs: ["source:contracts/sub-agent-orchestration.ts"],
    },
    removalCondition: {
      conditionId: "legacy-limit-readers-zero",
      satisfied: false,
      evidenceRefs: ["test:sub-agent-orchestration-compatibility"],
    },
    activeConsumerIds: ["consumer:legacy-sub-agent-payloads"],
  },
  {
    artifactId: "packages/core/src/orchestration/sub-session-runner.ts#legacy-limit-metadata",
    kind: "temporary_compatibility",
    ownerId: "owner:sub-session-runtime",
    createdVersion: "compat:sub-session-limit:v1",
    expiryCondition: {
      conditionId: "legacy-sub-session-payloads-migrated",
      satisfied: false,
      evidenceRefs: ["source:orchestration/sub-session-runner.ts"],
    },
    removalCondition: {
      conditionId: "legacy-sub-session-readers-zero",
      satisfied: false,
      evidenceRefs: ["test:sub-session-runtime-compatibility"],
    },
    activeConsumerIds: ["consumer:persisted-sub-session-metadata"],
  },
  {
    artifactId: "packages/core/src/channels/local-bridge/adapter.ts#experimental-local-bridges",
    kind: "experiment",
    ownerId: "owner:channel-local-bridge",
    createdVersion: "experiment:local-bridge:v1",
    expiryCondition: {
      conditionId: "local-bridge-release-decision",
      satisfied: false,
      evidenceRefs: ["source:channels/local-bridge/adapter.ts"],
    },
    removalCondition: {
      conditionId: "experimental-channel-consumers-zero",
      satisfied: false,
      evidenceRefs: ["test:local-bridge-channel-policy"],
    },
    activeConsumerIds: ["consumer:imessage-local", "consumer:kakaotalk-local"],
  },
]
