export const HARNESS_APPROVAL_SCOPES = ["entry", "draft_review", "apply", "activation"] as const
export type HarnessApprovalScope = typeof HARNESS_APPROVAL_SCOPES[number]

export interface HarnessImprovementEntryReceipt {
  requestId: string
  requesterId: string
  requesterType: "user" | "administrator" | "agent"
  explicitRequest: boolean
  classifiedBy: "llm"
  classification: "explicit_harness_improvement" | "ambiguous" | "casual_chat" | "ordinary_task"
  diagnosedAction: "enter_harness_improvement" | "ask_clarification" | "ordinary_request"
  targetHarnessSourceRefs: string[]
  diagnosedAt: number
  expiresAt: number
}

export type HarnessEntryDecision =
  | { status: "authorized"; scope: "entry"; requestId: string; targetHarnessSourceRefs: string[] }
  | {
      status: "blocked"
      reasonCode:
        | "entry_receipt_invalid"
        | "explicit_request_required"
        | "requester_not_authorized"
        | "llm_diagnosis_required"
        | "entry_target_required"
        | "entry_receipt_expired"
    }

export interface HarnessScopedApprovalReceipt {
  approvalId: string
  scope: HarnessApprovalScope
  decision: "approved" | "denied"
  approvedBy: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  appliedChecksum?: string
  runtimeTargetFingerprint?: string
  issuedAt: number
  expiresAt: number
}

export type HarnessScopedApprovalDecision =
  | {
      status: "authorized"
      scope: HarnessApprovalScope
      approvalId: string
      proposalFingerprint: string
      sourceSetFingerprint: string
      appliedChecksum?: string
      runtimeTargetFingerprint?: string
    }
  | {
      status: "blocked"
      reasonCode:
        | "approval_receipt_invalid"
        | "approval_denied"
        | "approval_expired"
        | "approval_scope_mismatch"
        | "approval_proposal_mismatch"
        | "approval_source_scope_mismatch"
        | "activation_lineage_missing"
        | "activation_lineage_mismatch"
    }

function exact(value: string | undefined): string {
  return value?.trim() ?? ""
}

export function authorizeHarnessImprovementEntry(input: {
  receipt: HarnessImprovementEntryReceipt
  now: number
}): HarnessEntryDecision {
  const receipt = input.receipt
  if (!exact(receipt.requestId) || !exact(receipt.requesterId)
    || !Number.isSafeInteger(receipt.diagnosedAt) || !Number.isSafeInteger(receipt.expiresAt)
    || !Number.isSafeInteger(input.now) || receipt.diagnosedAt > input.now) {
    return { status: "blocked", reasonCode: "entry_receipt_invalid" }
  }
  if (receipt.expiresAt <= input.now) return { status: "blocked", reasonCode: "entry_receipt_expired" }
  if (!receipt.explicitRequest || receipt.classification !== "explicit_harness_improvement") {
    return { status: "blocked", reasonCode: "explicit_request_required" }
  }
  if (receipt.requesterType !== "user" && receipt.requesterType !== "administrator") {
    return { status: "blocked", reasonCode: "requester_not_authorized" }
  }
  if (receipt.classifiedBy !== "llm" || receipt.diagnosedAction !== "enter_harness_improvement") {
    return { status: "blocked", reasonCode: "llm_diagnosis_required" }
  }
  const targetHarnessSourceRefs = receipt.targetHarnessSourceRefs.map((value) => value.trim()).filter(Boolean)
  if (targetHarnessSourceRefs.length === 0 || new Set(targetHarnessSourceRefs).size !== targetHarnessSourceRefs.length) {
    return { status: "blocked", reasonCode: "entry_target_required" }
  }
  return { status: "authorized", scope: "entry", requestId: receipt.requestId, targetHarnessSourceRefs }
}

export function authorizeHarnessApprovalScope(input: {
  requiredScope: HarnessApprovalScope
  receipt: HarnessScopedApprovalReceipt
  expectedProposalFingerprint: string
  expectedSourceSetFingerprint: string
  expectedAppliedChecksum?: string
  expectedRuntimeTargetFingerprint?: string
  now: number
}): HarnessScopedApprovalDecision {
  const receipt = input.receipt
  if (!HARNESS_APPROVAL_SCOPES.includes(receipt.scope)
    || !exact(receipt.approvalId) || !exact(receipt.approvedBy)
    || !exact(receipt.proposalFingerprint) || !exact(receipt.sourceSetFingerprint)
    || !Number.isSafeInteger(receipt.issuedAt) || !Number.isSafeInteger(receipt.expiresAt)
    || !Number.isSafeInteger(input.now) || receipt.issuedAt > input.now) {
    return { status: "blocked", reasonCode: "approval_receipt_invalid" }
  }
  if (receipt.decision !== "approved") return { status: "blocked", reasonCode: "approval_denied" }
  if (receipt.expiresAt <= input.now) return { status: "blocked", reasonCode: "approval_expired" }
  if (receipt.scope !== input.requiredScope) return { status: "blocked", reasonCode: "approval_scope_mismatch" }
  if (receipt.proposalFingerprint !== input.expectedProposalFingerprint) {
    return { status: "blocked", reasonCode: "approval_proposal_mismatch" }
  }
  if (receipt.sourceSetFingerprint !== input.expectedSourceSetFingerprint) {
    return { status: "blocked", reasonCode: "approval_source_scope_mismatch" }
  }
  if (input.requiredScope === "activation") {
    const appliedChecksum = exact(receipt.appliedChecksum)
    const runtimeTargetFingerprint = exact(receipt.runtimeTargetFingerprint)
    if (!appliedChecksum || !runtimeTargetFingerprint) {
      return { status: "blocked", reasonCode: "activation_lineage_missing" }
    }
    if (appliedChecksum !== exact(input.expectedAppliedChecksum)
      || runtimeTargetFingerprint !== exact(input.expectedRuntimeTargetFingerprint)) {
      return { status: "blocked", reasonCode: "activation_lineage_mismatch" }
    }
  }
  return {
    status: "authorized",
    scope: receipt.scope,
    approvalId: receipt.approvalId,
    proposalFingerprint: receipt.proposalFingerprint,
    sourceSetFingerprint: receipt.sourceSetFingerprint,
    ...(receipt.appliedChecksum ? { appliedChecksum: receipt.appliedChecksum } : {}),
    ...(receipt.runtimeTargetFingerprint ? { runtimeTargetFingerprint: receipt.runtimeTargetFingerprint } : {}),
  }
}

export async function enterAuthorizedHarnessImprovement<T>(input: {
  decision: HarnessEntryDecision
  enter: (authorization: Extract<HarnessEntryDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "entered"; result: T } | Extract<HarnessEntryDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "entered", result: await input.enter(input.decision) }
}

export async function executeApprovedHarnessScope<T>(input: {
  requiredScope: HarnessApprovalScope
  decision: HarnessScopedApprovalDecision
  execute: (authorization: Extract<HarnessScopedApprovalDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "executed"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "authorized") return input.decision
  if (input.decision.scope !== input.requiredScope) return { status: "blocked", reasonCode: "approval_scope_mismatch" }
  return { status: "executed", result: await input.execute(input.decision) }
}
