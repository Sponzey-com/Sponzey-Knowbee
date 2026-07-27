export type UiChangeBenefit =
  | "user_success"
  | "error_reduction"
  | "accessibility"
  | "safety"
  | "decoration"
  | "implementation_convenience"
  | "feature_exposure"

export interface UserFirstUiChangeProposal {
  changeId: string
  userGoal: string
  targetUser: string
  currentStepCount: number
  proposedStepCount: number
  successCriteria: string[]
  currentErrorRisk: number
  proposedErrorRisk: number
  benefits: UiChangeBenefit[]
  stepIncreaseJustification?: "safety" | "regulatory" | "data_loss_prevention"
  visibleStepIncreaseReason?: string
}

export type UserFirstUiChangeReasonCode =
  | "change_id_missing"
  | "user_goal_missing"
  | "target_user_missing"
  | "step_count_invalid"
  | "success_criteria_missing"
  | "error_risk_invalid"
  | "user_outcome_not_improved"
  | "decoration_or_internal_benefit_only"
  | "step_increase_unjustified"
  | "step_increase_reason_hidden"

export function evaluateUserFirstUiChange(proposal: UserFirstUiChangeProposal): {
  decision: "approved" | "rejected"
  reasonCodes: string[]
} {
  const reasons: UserFirstUiChangeReasonCode[] = []
  if (!proposal.changeId.trim()) reasons.push("change_id_missing")
  if (!proposal.userGoal.trim()) reasons.push("user_goal_missing")
  if (!proposal.targetUser.trim()) reasons.push("target_user_missing")
  if (
    !Number.isInteger(proposal.currentStepCount)
    || !Number.isInteger(proposal.proposedStepCount)
    || proposal.currentStepCount < 1
    || proposal.proposedStepCount < 1
  ) reasons.push("step_count_invalid")
  if (proposal.successCriteria.length === 0 || proposal.successCriteria.some((item) => !item.trim())) {
    reasons.push("success_criteria_missing")
  }
  if (
    !Number.isFinite(proposal.currentErrorRisk)
    || !Number.isFinite(proposal.proposedErrorRisk)
    || proposal.currentErrorRisk < 0
    || proposal.proposedErrorRisk < 0
  ) reasons.push("error_risk_invalid")

  const userBenefits = proposal.benefits.filter((benefit) =>
    benefit === "user_success" || benefit === "error_reduction" || benefit === "accessibility" || benefit === "safety")
  const improvesSteps = proposal.proposedStepCount < proposal.currentStepCount
  const improvesRisk = proposal.proposedErrorRisk < proposal.currentErrorRisk
  if (userBenefits.length === 0) reasons.push("decoration_or_internal_benefit_only")
  if (!improvesSteps && !improvesRisk && userBenefits.length === 0) {
    reasons.push("user_outcome_not_improved")
  }
  if (proposal.proposedStepCount > proposal.currentStepCount) {
    if (!proposal.stepIncreaseJustification) reasons.push("step_increase_unjustified")
    if (!proposal.visibleStepIncreaseReason?.trim()) reasons.push("step_increase_reason_hidden")
  }
  return reasons.length === 0
    ? { decision: "approved", reasonCodes: ["user_outcome_evidence_complete"] }
    : { decision: "rejected", reasonCodes: [...new Set(reasons)] }
}

export type WorkflowFrequency = "frequent" | "occasional" | "unknown"

export interface UserWorkflowStep {
  stepId: string
  state: string
  action: string
  nextState: string
  visibleStateChange: string
  nextActions: string[]
  required: boolean
}

export interface UserWorkflowContract {
  workflowId: string
  userGoal: string
  frequency: WorkflowFrequency
  frequencyEvidence?: string
  entryPoint: string
  terminalSuccess: string
  recoverableFailure: string
  steps: UserWorkflowStep[]
}

export function evaluateUserWorkflow(contract: UserWorkflowContract): {
  decision: "valid" | "invalid"
  reasonCodes: string[]
  requiredStepCount: number
} {
  const reasons: string[] = []
  if (!contract.workflowId.trim() || !contract.userGoal.trim() || !contract.entryPoint.trim()) {
    reasons.push("workflow_identity_incomplete")
  }
  if (!contract.terminalSuccess.trim() || !contract.recoverableFailure.trim()) {
    reasons.push("workflow_terminal_state_incomplete")
  }
  if (contract.frequency === "frequent" && !contract.frequencyEvidence?.trim()) {
    reasons.push("frequency_evidence_missing")
  }
  const transitions = new Map<string, string>()
  for (const step of contract.steps) {
    if (!step.stepId.trim() || !step.state.trim() || !step.action.trim() || !step.nextState.trim()) {
      reasons.push("workflow_step_incomplete")
    }
    if (!step.visibleStateChange.trim()) reasons.push("visible_state_change_missing")
    if (step.nextActions.length === 0 || step.nextActions.some((action) => !action.trim())) {
      reasons.push("next_action_missing")
    }
    const key = `${step.state.trim()}\u0000${step.action.trim()}`
    const existing = transitions.get(key)
    if (existing !== undefined && existing !== step.nextState.trim()) {
      reasons.push("unpredictable_state_action")
    } else {
      transitions.set(key, step.nextState.trim())
    }
  }
  return {
    decision: reasons.length === 0 ? "valid" : "invalid",
    reasonCodes: reasons.length === 0 ? ["workflow_evidence_complete"] : [...new Set(reasons)],
    requiredStepCount: contract.steps.filter((step) => step.required).length,
  }
}

export type UiInformationPriority =
  | "primary_action"
  | "required_context"
  | "status"
  | "secondary_detail"
  | "internal_detail"

export interface UiInformationItem {
  itemId: string
  priority: UiInformationPriority
  visualRank: number
  firstViewport: boolean
  contextualReveal: boolean
}

export function evaluateUiInformationPriority(items: UiInformationItem[]): {
  decision: "valid" | "invalid"
  reasonCodes: string[]
} {
  const reasons: string[] = []
  const primary = items.filter((item) => item.priority === "primary_action")
  const statuses = items.filter((item) => item.priority === "status")
  if (primary.length === 0 || primary.some((item) => !item.firstViewport)) {
    reasons.push("primary_action_not_visible")
  }
  if (statuses.some((item) => !item.firstViewport)) reasons.push("required_status_not_visible")
  if (items.some((item) =>
    (item.priority === "secondary_detail" || item.priority === "internal_detail")
    && !item.contextualReveal)) reasons.push("secondary_information_always_exposed")
  const highestPrimaryRank = Math.min(...primary.map((item) => item.visualRank))
  if (items.some((item) =>
    item.priority === "internal_detail" && item.visualRank < highestPrimaryRank)) {
    reasons.push("internal_detail_outranks_primary_action")
  }
  return reasons.length === 0
    ? { decision: "valid", reasonCodes: ["information_priority_valid"] }
    : { decision: "invalid", reasonCodes: [...new Set(reasons)] }
}

export type UiStatusAnnouncement = "polite" | "assertive" | "none"
export type UiMistakeRecoveryKind = "undo" | "cancel" | "confirmation" | "retry" | "correct_input" | "none"

export interface UiMistakeRecovery {
  kind: UiMistakeRecoveryKind
  actionLabel?: string
  preservesInput: boolean
}

export interface UiInteractionRecoveryContract {
  interactionId: string
  accessibleName: string
  keyboardOperable: boolean
  statusAnnouncement: UiStatusAnnouncement
  mistakeRecovery: UiMistakeRecovery
  destructive: boolean
  failurePossible: boolean
  failureReasonVisible: boolean
  nextActionVisible: boolean
}

export type UiInteractionRecoveryReasonCode =
  | "interaction_id_missing"
  | "accessible_name_missing"
  | "keyboard_operation_missing"
  | "status_announcement_missing"
  | "recovery_action_missing"
  | "input_not_preserved_for_correction"
  | "destructive_recovery_missing"
  | "failure_reason_missing"
  | "failure_next_action_missing"

export function evaluateUiInteractionRecovery(contract: UiInteractionRecoveryContract): {
  decision: "valid" | "invalid"
  reasonCodes: string[]
} {
  const reasons: UiInteractionRecoveryReasonCode[] = []
  if (!contract.interactionId.trim()) reasons.push("interaction_id_missing")
  if (!contract.accessibleName.trim()) reasons.push("accessible_name_missing")
  if (!contract.keyboardOperable) reasons.push("keyboard_operation_missing")
  if (contract.statusAnnouncement === "none") reasons.push("status_announcement_missing")

  if (contract.mistakeRecovery.kind === "none" || !contract.mistakeRecovery.actionLabel?.trim()) {
    reasons.push("recovery_action_missing")
  }
  if (contract.mistakeRecovery.kind === "correct_input" && !contract.mistakeRecovery.preservesInput) {
    reasons.push("input_not_preserved_for_correction")
  }
  if (
    contract.destructive
    && contract.mistakeRecovery.kind !== "undo"
    && contract.mistakeRecovery.kind !== "cancel"
    && contract.mistakeRecovery.kind !== "confirmation"
  ) {
    reasons.push("destructive_recovery_missing")
  }
  if (contract.failurePossible && !contract.failureReasonVisible) reasons.push("failure_reason_missing")
  if (contract.failurePossible && !contract.nextActionVisible) reasons.push("failure_next_action_missing")

  return reasons.length === 0
    ? { decision: "valid", reasonCodes: ["interaction_recovery_complete"] }
    : { decision: "invalid", reasonCodes: [...new Set(reasons)] }
}
