export const PROMPT_IMPROVEMENT_INPUT_PROVENANCES = [
  "prompt_source_file",
  "persistent_prompt_record",
  "user_chat_improvement_request",
  "user_chat_supporting_evidence",
] as const

export const PLATFORM_PROMPT_PROTECTED_INVARIANTS = [
  "product_identity",
  "safety_rules",
  "tool_boundary",
  "memory_isolation",
  "delegation_rules",
] as const

export type PromptImprovementInputProvenance = typeof PROMPT_IMPROVEMENT_INPUT_PROVENANCES[number]
export type PlatformPromptProtectedInvariant = typeof PLATFORM_PROMPT_PROTECTED_INVARIANTS[number]
export type PromptBehaviorImpact = "no_user_visible_change" | "user_visible_behavior_change" | "capability_or_permission_change"

export interface PromptImprovementInputReference {
  provenance: PromptImprovementInputProvenance
  reference: string
  fingerprint: string
}

export interface PlatformPromptInvariantReview {
  invariant: PlatformPromptProtectedInvariant
  proposalFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  decision: "preserved" | "changed" | "denied"
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
}

export interface PromptBehaviorChangeSummary {
  proposalFingerprint: string
  targetAgentRef: string
  beforeBehavior: string
  afterBehavior: string
  impactScope: string
  riskSummary: string
  rollbackSummary: string
  fingerprint: string
}

export interface PromptBehaviorConfirmationReceipt {
  schemaVersion: 1
  confirmationId: string
  proposalFingerprint: string
  summaryFingerprint: string
  actorRef: string
  decision: "confirmed" | "denied"
  confirmedAt: number
  expiresAt: number
}

export type PromptImprovementApplicationGateDecision =
  | { status: "authorized"; proposalFingerprint: string; sourceRefs: string[]; confirmationId?: string }
  | { status: "blocked"; reasonCode:
      | "prompt_source_missing"
      | "chat_used_as_prompt_source"
      | "invariant_review_incomplete"
      | "invariant_review_expired"
      | "invariant_scope_mismatch"
      | "invariant_not_preserved"
      | "behavior_summary_missing"
      | "behavior_summary_invalid"
      | "confirmation_missing"
      | "confirmation_denied"
      | "confirmation_expired"
      | "confirmation_scope_mismatch" }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function timestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  return value
}

function validateSummary(summary: PromptBehaviorChangeSummary, proposalFingerprint: string): boolean {
  return summary.proposalFingerprint === proposalFingerprint
    && [summary.targetAgentRef, summary.beforeBehavior, summary.afterBehavior, summary.impactScope,
      summary.riskSummary, summary.rollbackSummary, summary.fingerprint].every((value) => value.trim().length > 0)
}

export function authorizePromptImprovementApplication(input: {
  proposalFingerprint: string
  sourceInputs: PromptImprovementInputReference[]
  evidenceInputs?: PromptImprovementInputReference[]
  invariantReviews: PlatformPromptInvariantReview[]
  behaviorImpact: PromptBehaviorImpact
  behaviorSummary?: PromptBehaviorChangeSummary
  confirmation?: PromptBehaviorConfirmationReceipt
  expectedConfirmationActorRef: string
  now: number
}): PromptImprovementApplicationGateDecision {
  const proposalFingerprint = required(input.proposalFingerprint, "Proposal fingerprint")
  const actorRef = required(input.expectedConfirmationActorRef, "Expected confirmation actor reference")
  const now = timestamp(input.now, "Current time")
  if (input.sourceInputs.length === 0) return { status: "blocked", reasonCode: "prompt_source_missing" }
  if (input.sourceInputs.some((item) => item.provenance.startsWith("user_chat_"))) {
    return { status: "blocked", reasonCode: "chat_used_as_prompt_source" }
  }
  const sourceRefs = input.sourceInputs.map((item) => {
    required(item.fingerprint, "Prompt input fingerprint")
    return required(item.reference, "Prompt input reference")
  })
  if (new Set(sourceRefs).size !== sourceRefs.length) throw new Error("Prompt source references must be unique.")
  for (const evidence of input.evidenceInputs ?? []) {
    required(evidence.reference, "Prompt evidence reference")
    required(evidence.fingerprint, "Prompt evidence fingerprint")
  }

  const reviews = new Map<PlatformPromptProtectedInvariant, PlatformPromptInvariantReview>()
  for (const review of input.invariantReviews) {
    if (reviews.has(review.invariant)) throw new Error(`Invariant reviews must be unique: ${review.invariant}.`)
    reviews.set(review.invariant, review)
  }
  if (PLATFORM_PROMPT_PROTECTED_INVARIANTS.some((key) => !reviews.has(key))) {
    return { status: "blocked", reasonCode: "invariant_review_incomplete" }
  }
  for (const review of reviews.values()) {
    timestamp(review.reviewedAt, "Invariant review time")
    timestamp(review.expiresAt, "Invariant review expiry")
    if (review.reviewedAt > now || review.expiresAt <= now) return { status: "blocked", reasonCode: "invariant_review_expired" }
    if (review.proposalFingerprint !== proposalFingerprint || !review.baselineFingerprint.trim()
      || !review.proposedFingerprint.trim() || !review.reviewerRef.trim()) {
      return { status: "blocked", reasonCode: "invariant_scope_mismatch" }
    }
    if (review.decision !== "preserved") return { status: "blocked", reasonCode: "invariant_not_preserved" }
  }

  if (input.behaviorImpact === "no_user_visible_change") {
    return { status: "authorized", proposalFingerprint, sourceRefs }
  }
  const summary = input.behaviorSummary
  if (!summary) return { status: "blocked", reasonCode: "behavior_summary_missing" }
  if (!validateSummary(summary, proposalFingerprint)) return { status: "blocked", reasonCode: "behavior_summary_invalid" }
  const confirmation = input.confirmation
  if (!confirmation) return { status: "blocked", reasonCode: "confirmation_missing" }
  if (confirmation.schemaVersion !== 1) throw new Error("Unsupported prompt behavior confirmation schema version.")
  required(confirmation.confirmationId, "Confirmation ID")
  if (confirmation.decision !== "confirmed") return { status: "blocked", reasonCode: "confirmation_denied" }
  timestamp(confirmation.confirmedAt, "Confirmation time")
  timestamp(confirmation.expiresAt, "Confirmation expiry")
  if (confirmation.confirmedAt > now || confirmation.expiresAt <= now) return { status: "blocked", reasonCode: "confirmation_expired" }
  if (confirmation.actorRef !== actorRef || confirmation.proposalFingerprint !== proposalFingerprint
    || confirmation.summaryFingerprint !== summary.fingerprint) {
    return { status: "blocked", reasonCode: "confirmation_scope_mismatch" }
  }
  return { status: "authorized", proposalFingerprint, sourceRefs, confirmationId: confirmation.confirmationId }
}

export async function applyConfirmedPromptImprovement<T>(input: {
  decision: PromptImprovementApplicationGateDecision
  apply: (decision: Extract<PromptImprovementApplicationGateDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "applied"; result: T } | Extract<PromptImprovementApplicationGateDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "applied", result: await input.apply(input.decision) }
}
