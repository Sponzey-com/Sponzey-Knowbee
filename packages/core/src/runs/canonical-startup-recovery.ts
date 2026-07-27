import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js"
import type { RunStatus } from "./types.js"

export type CanonicalStartupRecoveryDecision =
  | {
      kind: "no_action"
      reasonCode: "canonical_recovery_already_reported"
      projectionStatus: "completed"
    }
  | {
      kind: "resume_waiting"
      reasonCode: "canonical_recovery_user_input_still_required"
      projectionStatus: "awaiting_user" | "awaiting_approval"
    }
  | {
      kind: "resume_delivery"
      reasonCode: "canonical_recovery_terminal_delivery_pending" | "canonical_recovery_delivery_transition_pending"
      deliveryMode: "replay_response_artifact" | "commit_transition_only"
      executePreviousAttempt: false
    }
  | {
      kind: "reassess_execution"
      reasonCode: "canonical_recovery_safe_pre_execution_reassessment" | "canonical_recovery_side_effect_requires_verification"
      resumeFrom: "solution_analysis" | "post_state_verification"
      executePreviousAttempt: false
    }
  | {
      kind: "manual_intervention"
      reasonCode:
        | "canonical_recovery_response_artifact_missing"
        | "canonical_recovery_attempt_receipt_missing"
        | "canonical_recovery_manifest_mismatch"
        | "canonical_recovery_state_unsupported"
      executePreviousAttempt: false
    }

export function classifyCanonicalStartupRecovery(input: {
  aggregate: CanonicalWorkAggregate
  rootRunStatus: RunStatus
  committedFinalDelivery: boolean
  responseArtifactAvailable: boolean
  sideEffectReceiptAvailable: boolean
  runtimeManifestMatches: boolean
}): CanonicalStartupRecoveryDecision {
  const state = input.aggregate.state

  if (state === "USER_REPORT") {
    return {
      kind: "no_action",
      reasonCode: "canonical_recovery_already_reported",
      projectionStatus: "completed",
    }
  }

  if (state === "USER_INPUT_REQUIRED") {
    return {
      kind: "resume_waiting",
      reasonCode: "canonical_recovery_user_input_still_required",
      projectionStatus: input.rootRunStatus === "awaiting_approval" ? "awaiting_approval" : "awaiting_user",
    }
  }

  if (["SUCCEEDED", "PARTIALLY_SUCCEEDED", "BLOCKED", "EXHAUSTED", "CANCELLED"].includes(state)) {
    if (input.committedFinalDelivery) {
      return {
        kind: "resume_delivery",
        reasonCode: "canonical_recovery_delivery_transition_pending",
        deliveryMode: "commit_transition_only",
        executePreviousAttempt: false,
      }
    }
    if (input.responseArtifactAvailable) {
      return {
        kind: "resume_delivery",
        reasonCode: "canonical_recovery_terminal_delivery_pending",
        deliveryMode: "replay_response_artifact",
        executePreviousAttempt: false,
      }
    }
    return {
      kind: "manual_intervention",
      reasonCode: "canonical_recovery_response_artifact_missing",
      executePreviousAttempt: false,
    }
  }

  if (!input.runtimeManifestMatches) {
    return {
      kind: "manual_intervention",
      reasonCode: "canonical_recovery_manifest_mismatch",
      executePreviousAttempt: false,
    }
  }

  if (state === "EXECUTING" || state === "RESULT_REVIEW") {
    if (!input.sideEffectReceiptAvailable) {
      return {
        kind: "manual_intervention",
        reasonCode: "canonical_recovery_attempt_receipt_missing",
        executePreviousAttempt: false,
      }
    }
    return {
      kind: "reassess_execution",
      reasonCode: "canonical_recovery_side_effect_requires_verification",
      resumeFrom: "post_state_verification",
      executePreviousAttempt: false,
    }
  }

  if (state === "REQUEST_RECEIVED" || state === "SOLUTION_ANALYZED" || state === "POLICY_VALIDATED") {
    return {
      kind: "reassess_execution",
      reasonCode: "canonical_recovery_safe_pre_execution_reassessment",
      resumeFrom: "solution_analysis",
      executePreviousAttempt: false,
    }
  }

  return {
    kind: "manual_intervention",
    reasonCode: "canonical_recovery_state_unsupported",
    executePreviousAttempt: false,
  }
}
