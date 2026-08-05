export const PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS = [
  "user_identity",
  "agent_identity",
  "memory_isolation",
  "permission",
  "safety",
  "response_language",
  "delegation_rules",
  "tool_boundary",
  "yeonjang_authorization",
] as const

export type PromptImprovementProtectedInvariant = typeof PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS[number]

export interface AgentPromptImprovementOwnershipSnapshot {
  schemaVersion: 1
  agentId: string
  agentName: string
  agentType: "main" | "sub_agent"
  roleRefs: string[]
  promptSourceRefs: string[]
  policyRefs: string[]
  testFixtureRefs: string[]
  platformOwnedRefs: string[]
  reviewerAgentId: string
  fingerprint: string
  capturedAt: number
}

export interface AgentPromptImprovementScope {
  roleRefs: string[]
  promptSourceRefs: string[]
  policyRefs: string[]
  testFixtureRefs: string[]
}

export interface PromptImprovementInvariantReview {
  invariant: PromptImprovementProtectedInvariant
  baselineRef: string
  proposedEffect: string
  result: "preserved" | "weakened"
  regressionTestReceiptRef: string
  regressionPassed: boolean
}

export interface SubAgentPromptImprovementApprovalReceipt {
  schemaVersion: 1
  approvalId: string
  proposalFingerprint: string
  ownershipFingerprint: string
  invariantReviewFingerprint: string
  reviewerAgentId: string
  approvedAgentId: string
  approvedPromptSourceRefs: string[]
  decision: "approved" | "denied"
  approvedAt: number
  expiresAt: number
}

export type AgentPromptImprovementAuthorizationDecision =
  | {
      status: "authorized"
      agentType: "main" | "sub_agent"
      proposalFingerprint: string
      authorization: "owner_invariant_review" | "parent_approval"
    }
  | {
      status: "blocked"
      reasonCode:
        | "ownership_snapshot_stale"
        | "ownership_fingerprint_mismatch"
        | "scope_not_owned"
        | "platform_scope_protected"
        | "invariant_review_incomplete"
        | "invariant_weakened"
        | "invariant_regression_failed"
        | "parent_approval_missing"
        | "parent_reviewer_mismatch"
        | "parent_self_review"
        | "parent_approval_denied"
        | "parent_approval_expired"
        | "parent_approval_scope_mismatch"
    }

const TYPED_REFERENCE = /^[a-z][a-z0-9_-]*:[^\s]+$/u

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function reference(value: string, field: string): string {
  const normalized = required(value, field)
  if (!TYPED_REFERENCE.test(normalized)) throw new Error(`${field} must be a typed reference.`)
  return normalized
}

function timestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

function uniqueReferences(values: string[], field: string): string[] {
  const normalized = values.map((value) => reference(value, field))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} values must be unique.`)
  return normalized
}

export function authorizeAgentPromptImprovement(input: {
  proposalFingerprint: string
  expectedOwnershipFingerprint: string
  invariantReviewFingerprint: string
  ownership: AgentPromptImprovementOwnershipSnapshot
  scope: AgentPromptImprovementScope
  invariantReviews: PromptImprovementInvariantReview[]
  parentApproval?: SubAgentPromptImprovementApprovalReceipt
  now: number
  maxOwnershipAgeMs: number
}): AgentPromptImprovementAuthorizationDecision {
  const proposalFingerprint = required(input.proposalFingerprint, "Proposal fingerprint")
  const expectedOwnershipFingerprint = required(input.expectedOwnershipFingerprint, "Expected ownership fingerprint")
  const invariantReviewFingerprint = required(input.invariantReviewFingerprint, "Invariant review fingerprint")
  const now = timestamp(input.now, "Current time")
  if (!Number.isSafeInteger(input.maxOwnershipAgeMs) || input.maxOwnershipAgeMs < 0) throw new Error("maxOwnershipAgeMs must be non-negative.")
  if (input.ownership.schemaVersion !== 1) throw new Error("Unsupported agent prompt ownership schema version.")
  const capturedAt = timestamp(input.ownership.capturedAt, "Ownership capturedAt")
  if (capturedAt > now || now - capturedAt > input.maxOwnershipAgeMs) return { status: "blocked", reasonCode: "ownership_snapshot_stale" }
  const agentId = required(input.ownership.agentId, "Agent ID")
  required(input.ownership.agentName, "Agent name")
  const ownershipFingerprint = required(input.ownership.fingerprint, "Ownership fingerprint")
  if (ownershipFingerprint !== expectedOwnershipFingerprint) return { status: "blocked", reasonCode: "ownership_fingerprint_mismatch" }

  const ownedScopes = {
    roleRefs: new Set(uniqueReferences(input.ownership.roleRefs, "Owned role reference")),
    promptSourceRefs: new Set(uniqueReferences(input.ownership.promptSourceRefs, "Owned prompt source reference")),
    policyRefs: new Set(uniqueReferences(input.ownership.policyRefs, "Owned policy reference")),
    testFixtureRefs: new Set(uniqueReferences(input.ownership.testFixtureRefs, "Owned test fixture reference")),
  }
  const platformOwnedRefs = new Set(uniqueReferences(input.ownership.platformOwnedRefs, "Platform-owned reference"))
  for (const key of Object.keys(ownedScopes) as Array<keyof typeof ownedScopes>) {
    const requested = uniqueReferences(input.scope[key], `Requested ${key}`)
    if (input.ownership.agentType === "sub_agent" && requested.some((value) => platformOwnedRefs.has(value))) {
      return { status: "blocked", reasonCode: "platform_scope_protected" }
    }
    if (requested.length === 0 || requested.some((value) => !ownedScopes[key].has(value))) {
      return { status: "blocked", reasonCode: "scope_not_owned" }
    }
  }

  const reviewByInvariant = new Map<PromptImprovementProtectedInvariant, PromptImprovementInvariantReview>()
  for (const review of input.invariantReviews) {
    if (reviewByInvariant.has(review.invariant)) throw new Error(`Invariant reviews must be unique: ${review.invariant}.`)
    reference(review.baselineRef, "Invariant baseline reference")
    required(review.proposedEffect, "Invariant proposed effect")
    reference(review.regressionTestReceiptRef, "Invariant regression test receipt reference")
    reviewByInvariant.set(review.invariant, review)
  }
  if (PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS.some((invariant) => !reviewByInvariant.has(invariant))) {
    return { status: "blocked", reasonCode: "invariant_review_incomplete" }
  }
  if ([...reviewByInvariant.values()].some((review) => review.result !== "preserved")) {
    return { status: "blocked", reasonCode: "invariant_weakened" }
  }
  if ([...reviewByInvariant.values()].some((review) => !review.regressionPassed)) {
    return { status: "blocked", reasonCode: "invariant_regression_failed" }
  }

  if (input.ownership.agentType === "main") {
    return { status: "authorized", agentType: "main", proposalFingerprint, authorization: "owner_invariant_review" }
  }
  const reviewerAgentId = required(input.ownership.reviewerAgentId, "Parent reviewer agent ID")
  if (reviewerAgentId === agentId) return { status: "blocked", reasonCode: "parent_self_review" }
  const approval = input.parentApproval
  if (!approval) return { status: "blocked", reasonCode: "parent_approval_missing" }
  if (approval.schemaVersion !== 1) throw new Error("Unsupported parent approval schema version.")
  required(approval.approvalId, "Parent approval ID")
  if (approval.reviewerAgentId !== reviewerAgentId) return { status: "blocked", reasonCode: "parent_reviewer_mismatch" }
  if (approval.reviewerAgentId === agentId) return { status: "blocked", reasonCode: "parent_self_review" }
  if (approval.decision !== "approved") return { status: "blocked", reasonCode: "parent_approval_denied" }
  if (approval.approvedAgentId !== agentId) return { status: "blocked", reasonCode: "parent_approval_scope_mismatch" }
  const approvedPromptSourceRefs = uniqueReferences(approval.approvedPromptSourceRefs, "Approved prompt source reference")
  const requestedPromptSourceRefs = uniqueReferences(input.scope.promptSourceRefs, "Requested prompt source reference")
  if (
    approvedPromptSourceRefs.length !== requestedPromptSourceRefs.length
    || approvedPromptSourceRefs.some((value) => !requestedPromptSourceRefs.includes(value))
  ) return { status: "blocked", reasonCode: "parent_approval_scope_mismatch" }
  timestamp(approval.approvedAt, "Parent approval time")
  timestamp(approval.expiresAt, "Parent approval expiry")
  if (approval.approvedAt > now || approval.expiresAt <= now) return { status: "blocked", reasonCode: "parent_approval_expired" }
  if (
    approval.proposalFingerprint !== proposalFingerprint
    || approval.ownershipFingerprint !== ownershipFingerprint
    || approval.invariantReviewFingerprint !== invariantReviewFingerprint
  ) return { status: "blocked", reasonCode: "parent_approval_scope_mismatch" }
  return { status: "authorized", agentType: "sub_agent", proposalFingerprint, authorization: "parent_approval" }
}

export async function applyAuthorizedAgentPromptImprovement<T>(input: {
  authorization: AgentPromptImprovementAuthorizationDecision
  apply: () => Promise<T>
}): Promise<{ status: "applied"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.authorization.status !== "authorized") return input.authorization
  return { status: "applied", result: await input.apply() }
}
