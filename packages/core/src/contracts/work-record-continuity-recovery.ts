import {
  mergeStructuredChildResultIntoParent,
  type StructuredChildResultMergeFailureReason,
} from "./evidence-delegation.js"
import {
  canTransitionWorkRecordStatus,
  decideWorkRecordRecoveryReentry,
  isDeclaredWorkRecordStatusTransition,
  validateRecoveryCandidateAgainstFailure,
  validateWorkRecord,
  type ChildWorkResult,
  type RecoveryCandidate,
  type WorkHandoffPackage,
  type WorkRecord,
  type WorkRecordStatus,
} from "./work-record.js"

export interface WorkRecordContinuityRecoveryInput {
  parentRecord: WorkRecord
  handoff: WorkHandoffPackage
  childResult: ChildWorkResult
  targetParentStatus: WorkRecordStatus
  selectedRecoveryAction?: RecoveryCandidate
  mergedAt: number
  previousRecoverySignatures: string[]
}

export type WorkRecordContinuityRecoveryRejectionReason =
  | StructuredChildResultMergeFailureReason
  | "transition_not_allowed"
  | "invalid_structured_record"
  | "recovery_action_required"
  | "recovery_action_invalid"
  | "recovery_signature_repeated"
  | "recovery_reentry_rejected"

export type WorkRecordContinuityRecoveryAcceptance =
  | {
      status: "accepted"
      parentWorkId: string
      childWorkId: string
      parentStepId: string
      targetAgentName: string
      transition: { fromStatus: WorkRecordStatus; toStatus: WorkRecordStatus }
      evidenceRefs: string[]
      recovery: null | {
        action: RecoveryCandidate["action_type"]
        targetStatus: "planned"
        signature: string
        changedDimensions: RecoveryCandidate["changed_dimensions"]
      }
      record: WorkRecord
    }
  | {
      status: "rejected"
      reasonCode: WorkRecordContinuityRecoveryRejectionReason
      issuePaths: string[]
    }

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`
}

export function createWorkRecoverySignature(candidate: RecoveryCandidate): string {
  return canonicalize({
    action: candidate.action_type,
    changedDimensions: [...candidate.changed_dimensions].sort(),
    changedInputOrStrategy: candidate.changed_input_or_strategy.trim().replace(/\s+/g, " ").toLowerCase(),
    metadata: candidate.metadata ?? null,
  })
}

function sameRecoveryCandidate(left: RecoveryCandidate, right: RecoveryCandidate): boolean {
  return canonicalize(left) === canonicalize(right)
}

function rejected(
  reasonCode: WorkRecordContinuityRecoveryRejectionReason,
  issuePaths: string[] = [],
): WorkRecordContinuityRecoveryAcceptance {
  return { status: "rejected", reasonCode, issuePaths: [...new Set(issuePaths)] }
}

export function decideWorkRecordContinuityRecoveryAcceptance(
  input: WorkRecordContinuityRecoveryInput,
): WorkRecordContinuityRecoveryAcceptance {
  const parentValidation = validateWorkRecord(input.parentRecord)
  if (!parentValidation.ok) {
    return rejected("invalid_parent_record", parentValidation.issues.map((item) => item.path))
  }
  const parent = parentValidation.value
  if (!isDeclaredWorkRecordStatusTransition(parent.status, input.targetParentStatus)) {
    return rejected("transition_not_allowed", ["$.targetParentStatus"])
  }

  const merge = mergeStructuredChildResultIntoParent({
    parentRecord: parent,
    handoff: input.handoff,
    childResult: input.childResult,
    mergedAt: input.mergedAt,
  })
  if (!merge.ok) return rejected(merge.reasonCode, merge.issues.map((item) => item.path))

  let transitionCandidate = structuredClone(merge.record)
  const recoveryRequired = input.targetParentStatus === "failed" || input.targetParentStatus === "partial"
  let recovery: Extract<WorkRecordContinuityRecoveryAcceptance, { status: "accepted" }>["recovery"] = null
  if (recoveryRequired) {
    const selected = input.selectedRecoveryAction
    if (!selected) return rejected("recovery_action_required", ["$.selectedRecoveryAction"])
    if (
      !transitionCandidate.failure_diagnosis ||
      !transitionCandidate.recovery_candidates?.some((candidate) => sameRecoveryCandidate(candidate, selected))
    ) {
      return rejected("recovery_action_invalid", ["$.selectedRecoveryAction"])
    }
    const candidateValidation = validateRecoveryCandidateAgainstFailure(
      transitionCandidate.failure_diagnosis,
      selected,
    )
    if (!candidateValidation.ok) {
      return rejected("recovery_action_invalid", candidateValidation.issues.map((item) => item.path))
    }
    const signature = createWorkRecoverySignature(selected)
    if (input.previousRecoverySignatures.includes(signature)) {
      return rejected("recovery_signature_repeated", ["$.previousRecoverySignatures"])
    }
    transitionCandidate = {
      ...transitionCandidate,
      selected_recovery_action: structuredClone(selected),
    }
    recovery = {
      action: selected.action_type,
      targetStatus: "planned",
      signature,
      changedDimensions: [...selected.changed_dimensions],
    }
  }

  const transition = canTransitionWorkRecordStatus(transitionCandidate, input.targetParentStatus)
  if (!transition.ok) {
    return rejected(
      transition.reasonCode === "transition_not_allowed"
        ? "transition_not_allowed"
        : transition.reasonCode === "recovery_action_required"
          ? "recovery_action_required"
          : transition.reasonCode === "recovery_action_invalid"
            ? "recovery_action_invalid"
            : "invalid_structured_record",
      ["$.targetParentStatus"],
    )
  }

  const transitioned: WorkRecord = { ...transitionCandidate, status: input.targetParentStatus }
  const transitionedValidation = validateWorkRecord(transitioned)
  if (!transitionedValidation.ok) {
    return rejected("invalid_structured_record", transitionedValidation.issues.map((item) => item.path))
  }
  if (recoveryRequired) {
    const reentry = decideWorkRecordRecoveryReentry(transitionedValidation.value)
    if (reentry.status !== "resume_planned" || reentry.reasonCode !== "changed_recovery_selected") {
      return rejected("recovery_reentry_rejected", ["$.selectedRecoveryAction"])
    }
  }

  return {
    status: "accepted",
    parentWorkId: merge.parentWorkId,
    childWorkId: merge.childWorkId,
    parentStepId: merge.parentStepId,
    targetAgentName: input.handoff.target_agent_name,
    transition: { fromStatus: parent.status, toStatus: input.targetParentStatus },
    evidenceRefs: [...input.childResult.evidence],
    recovery,
    record: transitionedValidation.value,
  }
}
