import type { ReleaseAdministratorPrincipal } from "./release-administrator.js"
import type {
  SubAgentRolloutThresholdAuthorizationPort,
  SubAgentRolloutThresholdAuthorizationReceipt,
  SubAgentRolloutThresholdPolicyCandidate,
} from "./sub-agent-rollout-threshold-policy.js"
import { validateSubAgentRolloutThresholdPolicy } from "./sub-agent-rollout-threshold-policy.js"

export type { ReleaseAdministratorPrincipal } from "./release-administrator.js"

export interface ReleasePolicyAuthorizationRecord
  extends SubAgentRolloutThresholdAuthorizationReceipt {
  authenticationId: string
}

export interface ReleasePolicyAuthorizationBinding {
  scope: "sub_agent_rollout_thresholds"
  policyId: string
  policyVersion: number
  releaseMode: SubAgentRolloutThresholdPolicyCandidate["releaseMode"]
}

export interface ReleasePolicyAuthorizationRepository {
  append(record: Readonly<ReleasePolicyAuthorizationRecord>): { status: "stored" | "duplicate_id" }
  findLatest(
    binding: Readonly<ReleasePolicyAuthorizationBinding>,
  ): Readonly<ReleasePolicyAuthorizationRecord> | undefined
}

export interface ReleaseRolloutPolicySelector {
  policyId: string
  policyVersion: number
  releaseMode: SubAgentRolloutThresholdPolicyCandidate["releaseMode"]
}

export type SelectedReleaseRolloutThresholdPolicy = {
  status: "selected"
  candidate: Readonly<SubAgentRolloutThresholdPolicyCandidate>
  authorizationPort: SubAgentRolloutThresholdAuthorizationPort
}

export function selectReleaseRolloutThresholdPolicy(input: {
  selector: ReleaseRolloutPolicySelector
  repository: ReleasePolicyAuthorizationRepository
}): SelectedReleaseRolloutThresholdPolicy | { status: "baseline_only"; reasonCodes: string[] } {
  const { selector } = input
  if (
    !selector.policyId.trim() ||
    selector.policyId !== selector.policyId.trim() ||
    !Number.isSafeInteger(selector.policyVersion) ||
    selector.policyVersion < 1 ||
    (selector.releaseMode !== "limited_beta" && selector.releaseMode !== "full_enable")
  ) {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selector_invalid"] }
  }

  let record: Readonly<ReleasePolicyAuthorizationRecord> | undefined
  try {
    record = input.repository.findLatest({
      scope: "sub_agent_rollout_thresholds",
      policyId: selector.policyId,
      policyVersion: selector.policyVersion,
      releaseMode: selector.releaseMode,
    })
  } catch {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selection_unavailable"] }
  }
  if (!record) {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selection_missing"] }
  }
  if (record.decision !== "approved") {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selection_not_approved"] }
  }
  if (
    record.scope !== "sub_agent_rollout_thresholds" ||
    record.policyId !== selector.policyId ||
    record.policyVersion !== selector.policyVersion ||
    record.releaseMode !== selector.releaseMode
  ) {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selection_binding_mismatch"] }
  }

  const validation = validateSubAgentRolloutThresholdPolicy({
    schemaVersion: 1,
    policyId: record.policyId,
    policyVersion: record.policyVersion,
    releaseMode: record.releaseMode,
    thresholds: { ...record.thresholdSnapshot },
  })
  if (validation.status === "baseline_only") {
    return { status: "baseline_only", reasonCodes: ["rollout_policy_selection_record_invalid"] }
  }

  const authorization = Object.freeze({
    ...record,
    thresholdSnapshot: Object.freeze({ ...record.thresholdSnapshot }),
  })
  return {
    status: "selected",
    candidate: validation.candidate,
    authorizationPort: {
      resolve: () => authorization,
    },
  }
}

export function authorizeSubAgentRolloutThresholdPolicy(input: {
  candidate: SubAgentRolloutThresholdPolicyCandidate
  decision: ReleasePolicyAuthorizationRecord["decision"]
  principal: ReleaseAdministratorPrincipal
  authorizationId: string
  decidedAt: number
  repository: ReleasePolicyAuthorizationRepository
}):
  | { status: "recorded"; record: Readonly<ReleasePolicyAuthorizationRecord> }
  | { status: "rejected"; reasonCode: string } {
  if (!input.principal.authenticationId.trim()) {
    return {
      status: "rejected",
      reasonCode: "release_authorization_authentication_required",
    }
  }
  if (
    input.principal.principalType !== "authenticated_user" ||
    !input.principal.principalId.trim()
  ) {
    return { status: "rejected", reasonCode: "release_authorization_principal_invalid" }
  }
  if (!input.principal.roles.includes("release_administrator")) {
    return { status: "rejected", reasonCode: "release_authorization_role_required" }
  }
  if (
    !input.authorizationId.trim() ||
    !Number.isSafeInteger(input.decidedAt) ||
    input.decidedAt < 0
  ) {
    return { status: "rejected", reasonCode: "release_authorization_command_invalid" }
  }
  if (
    input.decision !== "approved" &&
    input.decision !== "denied" &&
    input.decision !== "revoked"
  ) {
    return { status: "rejected", reasonCode: "release_authorization_decision_invalid" }
  }
  const validation = validateSubAgentRolloutThresholdPolicy(input.candidate)
  if (validation.status === "baseline_only") {
    return {
      status: "rejected",
      reasonCode: `release_authorization_candidate_invalid:${validation.reasonCodes[0] ?? "unknown"}`,
    }
  }
  const record: Readonly<ReleasePolicyAuthorizationRecord> = Object.freeze({
    schemaVersion: 1,
    authorizationId: input.authorizationId.trim(),
    decision: input.decision,
    actorType: "administrator",
    actorId: input.principal.principalId.trim(),
    authenticationId: input.principal.authenticationId.trim(),
    scope: "sub_agent_rollout_thresholds",
    policyId: validation.candidate.policyId,
    policyVersion: validation.candidate.policyVersion,
    releaseMode: validation.candidate.releaseMode,
    thresholdSnapshot: Object.freeze({ ...validation.candidate.thresholds }),
    approvedAt: input.decidedAt,
  })
  try {
    if (input.repository.append(record).status === "duplicate_id") {
      return { status: "rejected", reasonCode: "release_authorization_id_duplicate" }
    }
  } catch {
    return { status: "rejected", reasonCode: "release_authorization_repository_failed" }
  }
  return { status: "recorded", record }
}

export function createSubAgentRolloutThresholdAuthorizationPort(
  repository: ReleasePolicyAuthorizationRepository,
): SubAgentRolloutThresholdAuthorizationPort {
  return {
    resolve(candidate) {
      try {
        const record = repository.findLatest({
          scope: "sub_agent_rollout_thresholds",
          policyId: candidate.policyId,
          policyVersion: candidate.policyVersion,
          releaseMode: candidate.releaseMode,
        })
        return record?.decision === "approved" ? record : undefined
      } catch {
        return undefined
      }
    },
  }
}
