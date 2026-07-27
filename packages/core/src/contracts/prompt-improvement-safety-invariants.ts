import type { CompletePromptActivationDecision } from "./complete-prompt-activation.js"
import type { PlatformPromptInvariantReview } from "./prompt-improvement-application-gate.js"
import type { PromptActivationEvidenceDecision } from "./prompt-activation-evidence.js"

export const PROMPT_SAFETY_BOUNDARY_KINDS = ["refusal", "safety", "permission", "data"] as const
export const PROMPT_SAFETY_MANDATORY_CONTROLS = ["change_disclosure", "audit_log", "required_tests", "approval"] as const

export type PromptSafetyBoundaryKind = (typeof PROMPT_SAFETY_BOUNDARY_KINDS)[number]
export type PromptSafetyMandatoryControl = (typeof PROMPT_SAFETY_MANDATORY_CONTROLS)[number]
export type PromptSafetyEnforcement = "monitor" | "block" | "refuse"
export type PromptSafetySemanticDecision = "preserved" | "strengthened" | "weakened"
export type PromptSafetyControlLevel = "optional" | "required" | "explicit"
export type PromptSafetyControlOutcome = "verified" | "hide" | "suppress" | "skip" | "bypass"
export type PromptSafetyActivationState = "proposed" | "validated" | "approved" | "active" | "completed"

export interface PromptSafetyBoundaryRuleSnapshot {
  ruleId: string
  kind: PromptSafetyBoundaryKind
  canonicalOwner: string
  checksum: string
  enforcement: PromptSafetyEnforcement
  semanticDecision: PromptSafetySemanticDecision
  baselineChecksum: string
  reviewEvidenceRef: string
}

export interface PromptSafetyControlReceipt {
  control: PromptSafetyMandatoryControl
  baselineLevel: PromptSafetyControlLevel
  proposedLevel: PromptSafetyControlLevel
  outcome: PromptSafetyControlOutcome
  proposalFingerprint: string
  sourceSetFingerprint: string
  evidenceRef: string
}

export type PromptSafetyActivationClaim =
  | { claimState: "proposed" | "validated" | "approved" }
  | {
      claimState: "active" | "completed"
      proposalFingerprint: string
      sourceSetFingerprint: string
      sourceRef: string
      sourceChecksum: string
      runtimeTargetFingerprint: string
      confirmationRef: string
      activationEvidence: PromptActivationEvidenceDecision
      completeActivation: CompletePromptActivationDecision
    }

export interface PromptImprovementSafetyInvariantReceipt {
  schemaVersion: 1
  invariant: "safety_rules"
  decision: "preserved"
  proposalFingerprint: string
  sourceSetFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
  boundaryRuleIds: string[]
  mandatoryControls: PromptSafetyMandatoryControl[]
  activationState: PromptSafetyActivationState
  activationId: string | undefined
}

export type PromptImprovementSafetyInvariantReasonCode =
  | "safety_boundary_snapshot_invalid"
  | "safety_boundary_missing"
  | "safety_boundary_owner_changed"
  | "safety_boundary_weakened"
  | "safety_boundary_change_unverified"
  | "mandatory_control_invalid"
  | "mandatory_control_missing"
  | "mandatory_control_bypass"
  | "mandatory_control_weakened"
  | "mandatory_control_scope_mismatch"
  | "activation_confirmation_missing"
  | "activation_scope_mismatch"
  | "activation_source_mismatch"
  | "activation_runtime_mismatch"
  | "activation_evidence_mismatch"
  | "safety_review_lineage_invalid"

export type PromptImprovementSafetyInvariantDecision =
  | { status: "authorized"; receipt: PromptImprovementSafetyInvariantReceipt }
  | { status: "blocked"; reasonCode: PromptImprovementSafetyInvariantReasonCode }

export type SafetyRulesInvariantProjectionDecision =
  | { status: "authorized"; review: PlatformPromptInvariantReview }
  | { status: "blocked"; reasonCode:
      | "safety_review_receipt_invalid"
      | "safety_review_expired"
      | "safety_review_scope_mismatch"
      | "goal_section3_lineage_mismatch" }

const ENFORCEMENT_ORDER: Record<PromptSafetyEnforcement, number> = { monitor: 0, block: 1, refuse: 2 }
const CONTROL_LEVEL_ORDER: Record<PromptSafetyControlLevel, number> = { optional: 0, required: 1, explicit: 2 }
const ENFORCEMENTS = new Set<PromptSafetyEnforcement>(Object.keys(ENFORCEMENT_ORDER) as PromptSafetyEnforcement[])
const SEMANTIC_DECISIONS = new Set<PromptSafetySemanticDecision>(["preserved", "strengthened", "weakened"])
const CONTROL_LEVELS = new Set<PromptSafetyControlLevel>(Object.keys(CONTROL_LEVEL_ORDER) as PromptSafetyControlLevel[])
const CONTROL_OUTCOMES = new Set<PromptSafetyControlOutcome>(["verified", "hide", "suppress", "skip", "bypass"])

function exact(value: string | undefined): string {
  return value?.trim() ?? ""
}

function unique(values: string[]): string[] | undefined {
  const normalized = values.map(exact)
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) return undefined
  return normalized
}

function sameSet(left: string[], right: readonly string[]): boolean {
  const normalizedLeft = unique(left)
  const normalizedRight = unique([...right])
  if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) return false
  const expected = new Set(normalizedRight)
  return normalizedLeft.every((value) => expected.has(value))
}

function ruleSnapshotValid(rule: PromptSafetyBoundaryRuleSnapshot): boolean {
  return Boolean(exact(rule.ruleId) && PROMPT_SAFETY_BOUNDARY_KINDS.includes(rule.kind)
    && exact(rule.canonicalOwner) && exact(rule.checksum) && ENFORCEMENTS.has(rule.enforcement)
    && SEMANTIC_DECISIONS.has(rule.semanticDecision) && exact(rule.baselineChecksum)
    && exact(rule.reviewEvidenceRef))
}

function rulesValid(rules: PromptSafetyBoundaryRuleSnapshot[], requireCompleteKinds: boolean): boolean {
  return Boolean(unique(rules.map((rule) => rule.ruleId)) && rules.every(ruleSnapshotValid)
    && (!requireCompleteKinds || PROMPT_SAFETY_BOUNDARY_KINDS.every((kind) => rules.some((rule) => rule.kind === kind))))
}

function controlsValid(controls: PromptSafetyControlReceipt[]): boolean {
  return controls.every((control) => Boolean(PROMPT_SAFETY_MANDATORY_CONTROLS.includes(control.control)
    && CONTROL_LEVELS.has(control.baselineLevel) && CONTROL_LEVELS.has(control.proposedLevel)
    && CONTROL_OUTCOMES.has(control.outcome) && exact(control.proposalFingerprint)
    && exact(control.sourceSetFingerprint) && exact(control.evidenceRef)))
}

function activationEvidenceMatches(claim: Extract<PromptSafetyActivationClaim, { claimState: "active" | "completed" }>): boolean {
  const activation = claim.activationEvidence
  const complete = claim.completeActivation
  return activation.status === "authorized" && complete.status === "authorized"
    && activation.activationId === complete.activationId
    && activation.sourceRef === complete.sourceRef
    && activation.sourceVersion === complete.sourceVersion
    && activation.loaderId === complete.loaderId
    && activation.activatedAt === complete.activatedAt
    && activation.method === complete.method
    && activation.evidenceRefs.length > 0 && complete.evidenceRefs.length > 0
    && complete.testIds.length > 0 && Boolean(exact(complete.rollbackSourceRef))
}

function lineageValid(input: {
  proposalFingerprint: string
  sourceSetFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
}): boolean {
  return Boolean(exact(input.proposalFingerprint) && exact(input.sourceSetFingerprint)
    && exact(input.baselineFingerprint) && exact(input.proposedFingerprint)
    && input.baselineFingerprint !== input.proposedFingerprint && exact(input.goalSection3Fingerprint)
    && exact(input.reviewerRef) && Number.isSafeInteger(input.reviewedAt) && input.reviewedAt >= 0
    && Number.isSafeInteger(input.expiresAt) && input.expiresAt > input.reviewedAt)
}

export function authorizePromptImprovementSafetyInvariant(input: {
  baselineRules: PromptSafetyBoundaryRuleSnapshot[]
  proposedRules: PromptSafetyBoundaryRuleSnapshot[]
  controls: PromptSafetyControlReceipt[]
  activationClaim?: PromptSafetyActivationClaim
  expectedRuntimeTargetFingerprint: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  baselineFingerprint: string
  proposedFingerprint: string
  goalSection3Fingerprint: string
  reviewerRef: string
  reviewedAt: number
  expiresAt: number
}): PromptImprovementSafetyInvariantDecision {
  if (!rulesValid(input.baselineRules, true) || !rulesValid(input.proposedRules, false)) {
    return { status: "blocked", reasonCode: "safety_boundary_snapshot_invalid" }
  }
  const proposedById = new Map(input.proposedRules.map((rule) => [rule.ruleId, rule]))
  const baselineIds = new Set(input.baselineRules.map((rule) => rule.ruleId))
  if (input.proposedRules.some((rule) => !baselineIds.has(rule.ruleId))) {
    return { status: "blocked", reasonCode: "safety_boundary_owner_changed" }
  }
  for (const baseline of input.baselineRules) {
    const proposed = proposedById.get(baseline.ruleId)
    if (!proposed) return { status: "blocked", reasonCode: "safety_boundary_missing" }
    if (proposed.kind !== baseline.kind || proposed.canonicalOwner !== baseline.canonicalOwner) {
      return { status: "blocked", reasonCode: "safety_boundary_owner_changed" }
    }
    if (proposed.semanticDecision === "weakened"
      || ENFORCEMENT_ORDER[proposed.enforcement] < ENFORCEMENT_ORDER[baseline.enforcement]) {
      return { status: "blocked", reasonCode: "safety_boundary_weakened" }
    }
    const changed = proposed.checksum !== baseline.checksum
    if (proposed.baselineChecksum !== baseline.checksum
      || (changed && (proposed.semanticDecision !== "strengthened"
        || ENFORCEMENT_ORDER[proposed.enforcement] <= ENFORCEMENT_ORDER[baseline.enforcement]))
      || (!changed && proposed.semanticDecision !== "preserved")) {
      return { status: "blocked", reasonCode: "safety_boundary_change_unverified" }
    }
  }

  if (!controlsValid(input.controls) || !unique(input.controls.map((control) => control.control))) {
    return { status: "blocked", reasonCode: "mandatory_control_invalid" }
  }
  if (!sameSet(input.controls.map((control) => control.control), PROMPT_SAFETY_MANDATORY_CONTROLS)) {
    return { status: "blocked", reasonCode: "mandatory_control_missing" }
  }
  for (const control of input.controls) {
    if (control.outcome !== "verified") return { status: "blocked", reasonCode: "mandatory_control_bypass" }
    if (CONTROL_LEVEL_ORDER[control.proposedLevel] < CONTROL_LEVEL_ORDER[control.baselineLevel]) {
      return { status: "blocked", reasonCode: "mandatory_control_weakened" }
    }
    if (control.proposalFingerprint !== exact(input.proposalFingerprint)
      || control.sourceSetFingerprint !== exact(input.sourceSetFingerprint)) {
      return { status: "blocked", reasonCode: "mandatory_control_scope_mismatch" }
    }
  }

  const claim = input.activationClaim
  if (!claim) return { status: "blocked", reasonCode: "activation_confirmation_missing" }
  let activationId: string | undefined
  if (claim.claimState === "active" || claim.claimState === "completed") {
    if (!exact(claim.proposalFingerprint) || !exact(claim.sourceSetFingerprint)
      || !exact(claim.sourceRef) || !exact(claim.sourceChecksum)
      || !exact(claim.runtimeTargetFingerprint) || !exact(claim.confirmationRef)
      || !claim.activationEvidence || !claim.completeActivation) {
      return { status: "blocked", reasonCode: "activation_confirmation_missing" }
    }
    if (claim.proposalFingerprint !== exact(input.proposalFingerprint)
      || claim.sourceSetFingerprint !== exact(input.sourceSetFingerprint)) {
      return { status: "blocked", reasonCode: "activation_scope_mismatch" }
    }
    if (claim.activationEvidence.status !== "authorized"
      || claim.sourceRef !== claim.activationEvidence.sourceRef
      || claim.sourceChecksum !== claim.activationEvidence.sourceChecksum) {
      return { status: "blocked", reasonCode: "activation_source_mismatch" }
    }
    if (!exact(claim.runtimeTargetFingerprint)
      || claim.runtimeTargetFingerprint !== exact(input.expectedRuntimeTargetFingerprint)) {
      return { status: "blocked", reasonCode: "activation_runtime_mismatch" }
    }
    if (!exact(claim.confirmationRef) || !activationEvidenceMatches(claim)) {
      return { status: "blocked", reasonCode: "activation_evidence_mismatch" }
    }
    activationId = claim.activationEvidence.activationId
  }

  if (!lineageValid(input)) return { status: "blocked", reasonCode: "safety_review_lineage_invalid" }
  return {
    status: "authorized",
    receipt: {
      schemaVersion: 1,
      invariant: "safety_rules",
      decision: "preserved",
      proposalFingerprint: exact(input.proposalFingerprint),
      sourceSetFingerprint: exact(input.sourceSetFingerprint),
      baselineFingerprint: exact(input.baselineFingerprint),
      proposedFingerprint: exact(input.proposedFingerprint),
      goalSection3Fingerprint: exact(input.goalSection3Fingerprint),
      reviewerRef: exact(input.reviewerRef),
      reviewedAt: input.reviewedAt,
      expiresAt: input.expiresAt,
      boundaryRuleIds: input.baselineRules.map((rule) => rule.ruleId),
      mandatoryControls: [...PROMPT_SAFETY_MANDATORY_CONTROLS],
      activationState: claim.claimState,
      activationId,
    },
  }
}

export function projectSafetyRulesInvariantReview(input: {
  receipt: PromptImprovementSafetyInvariantReceipt
  expectedProposalFingerprint: string
  currentGoalSection3Fingerprint: string
  now: number
}): SafetyRulesInvariantProjectionDecision {
  const receipt = input.receipt
  if (receipt.schemaVersion !== 1 || receipt.invariant !== "safety_rules" || receipt.decision !== "preserved"
    || !exact(receipt.proposalFingerprint) || !exact(receipt.sourceSetFingerprint)
    || !exact(receipt.baselineFingerprint) || !exact(receipt.proposedFingerprint)
    || receipt.baselineFingerprint === receipt.proposedFingerprint || !exact(receipt.reviewerRef)
    || !unique(receipt.boundaryRuleIds) || !sameSet(receipt.mandatoryControls, PROMPT_SAFETY_MANDATORY_CONTROLS)
    || !Number.isSafeInteger(receipt.reviewedAt) || !Number.isSafeInteger(receipt.expiresAt)
    || !Number.isSafeInteger(input.now) || receipt.reviewedAt > input.now
    || ((receipt.activationState === "active" || receipt.activationState === "completed") && !exact(receipt.activationId))) {
    return { status: "blocked", reasonCode: "safety_review_receipt_invalid" }
  }
  if (receipt.expiresAt <= input.now) return { status: "blocked", reasonCode: "safety_review_expired" }
  if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
    return { status: "blocked", reasonCode: "safety_review_scope_mismatch" }
  }
  if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
    return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" }
  }
  return {
    status: "authorized",
    review: {
      invariant: "safety_rules",
      proposalFingerprint: receipt.proposalFingerprint,
      baselineFingerprint: receipt.baselineFingerprint,
      proposedFingerprint: receipt.proposedFingerprint,
      decision: "preserved",
      reviewerRef: receipt.reviewerRef,
      reviewedAt: receipt.reviewedAt,
      expiresAt: receipt.expiresAt,
    },
  }
}
