import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  PROMPT_SAFETY_BOUNDARY_KINDS,
  PROMPT_SAFETY_MANDATORY_CONTROLS,
  authorizePromptImprovementSafetyInvariant,
  projectSafetyRulesInvariantReview,
  type PromptSafetyBoundaryRuleSnapshot,
  type PromptSafetyControlReceipt,
} from "../packages/core/src/contracts/prompt-improvement-safety-invariants.ts"

const now = 1_000

function rules(): PromptSafetyBoundaryRuleSnapshot[] {
  return PROMPT_SAFETY_BOUNDARY_KINDS.map((kind) => ({
    ruleId: `rule:${kind}`,
    kind,
    canonicalOwner: kind === "refusal" ? "safety_policy" : `${kind}_policy`,
    checksum: `checksum:${kind}:v1`,
    enforcement: kind === "refusal" ? "refuse" : "block",
    semanticDecision: "preserved",
    baselineChecksum: `checksum:${kind}:v1`,
    reviewEvidenceRef: `review:${kind}:1391`,
  }))
}

function controls(): PromptSafetyControlReceipt[] {
  return PROMPT_SAFETY_MANDATORY_CONTROLS.map((control) => ({
    control,
    baselineLevel: "required",
    proposedLevel: "required",
    outcome: "verified",
    proposalFingerprint: "proposal:1391",
    sourceSetFingerprint: "sources:1391",
    evidenceRef: `control:${control}:1391`,
  }))
}

const activationEvidence = {
  status: "authorized" as const,
  activationId: "activation:1391",
  sourceRef: "prompts/safety_policy.md",
  sourceVersion: "v2",
  sourceChecksum: "source:checksum:v2",
  loaderId: "loader:main",
  activatedAt: now - 10,
  method: "reload" as const,
  evidenceRefs: ["evidence:loader", "evidence:reload"],
}

const completeActivation = {
  status: "authorized" as const,
  activationId: "activation:1391",
  sourceRef: "prompts/safety_policy.md",
  sourceVersion: "v2",
  loaderId: "loader:main",
  activatedAt: now - 10,
  method: "reload",
  testIds: ["test:safety-regression"],
  rollbackSourceRef: "rollback:safety:v1",
  evidenceRefs: ["evidence:loader", "evidence:reload", "evidence:test", "evidence:rollback"],
}

function activationClaim(overrides: Record<string, unknown> = {}) {
  return {
    claimState: "active" as const,
    proposalFingerprint: "proposal:1391",
    sourceSetFingerprint: "sources:1391",
    sourceRef: "prompts/safety_policy.md",
    sourceChecksum: "source:checksum:v2",
    runtimeTargetFingerprint: "runtime:main:snapshot:v2",
    confirmationRef: "confirmation:activation:1391",
    activationEvidence,
    completeActivation,
    ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptImprovementSafetyInvariant({
    baselineRules: rules(),
    proposedRules: rules(),
    controls: controls(),
    activationClaim: activationClaim(),
    expectedRuntimeTargetFingerprint: "runtime:main:snapshot:v2",
    proposalFingerprint: "proposal:1391",
    sourceSetFingerprint: "sources:1391",
    baselineFingerprint: "safety:baseline",
    proposedFingerprint: "safety:proposed",
    goalSection3Fingerprint: "goal:section3:v1",
    reviewerRef: "reviewer:main",
    reviewedAt: now,
    expiresAt: now + 100,
    ...overrides,
  })
}

describe("task1391 prompt-improvement safety invariant review", () => {
  it("preserves every safety boundary and mandatory control with confirmed activation", () => {
    expect(authorize()).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "safety_rules",
        decision: "preserved",
        boundaryRuleIds: PROMPT_SAFETY_BOUNDARY_KINDS.map((kind) => `rule:${kind}`),
        mandatoryControls: PROMPT_SAFETY_MANDATORY_CONTROLS,
        activationState: "active",
        activationId: "activation:1391",
      },
    })
  })

  it.each([
    ["missing rule", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.slice(1), "safety_boundary_missing"],
    ["canonical owner", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.map((item, index) => index === 0 ? { ...item, canonicalOwner: "other_policy" } : item), "safety_boundary_owner_changed"],
    ["boundary kind", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.map((item, index) => index === 0 ? { ...item, kind: "permission" as const } : item), "safety_boundary_owner_changed"],
    ["enforcement", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.map((item, index) => index === 0 ? { ...item, enforcement: "monitor" as const } : item), "safety_boundary_weakened"],
    ["semantic decision", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.map((item, index) => index === 0 ? { ...item, semanticDecision: "weakened" as const } : item), "safety_boundary_weakened"],
    ["unreviewed checksum", (items: PromptSafetyBoundaryRuleSnapshot[]) => items.map((item, index) => index === 0 ? { ...item, checksum: "checksum:changed" } : item), "safety_boundary_change_unverified"],
  ] as const)("rejects unsafe boundary change through %s", (_label, mutate, reasonCode) => {
    expect(authorize({ proposedRules: mutate(rules()) })).toEqual({ status: "blocked", reasonCode })
  })

  it("allows an independently reviewed stronger boundary", () => {
    const proposedRules = rules()
    proposedRules[1] = {
      ...proposedRules[1]!,
      checksum: "checksum:safety:v2",
      enforcement: "refuse",
      semanticDecision: "strengthened",
      reviewEvidenceRef: "review:safety:strengthened:1391",
    }
    expect(authorize({ proposedRules })).toMatchObject({ status: "authorized" })
  })

  it("rejects a second prompt definition for an existing canonical safety boundary", () => {
    expect(authorize({
      proposedRules: [...rules(), {
        ...rules()[1]!,
        ruleId: "rule:safety:duplicate",
        checksum: "checksum:safety:duplicate",
        semanticDecision: "strengthened",
        enforcement: "refuse",
      }],
    })).toEqual({ status: "blocked", reasonCode: "safety_boundary_owner_changed" })
  })

  it.each([
    ["change_disclosure", "hide"],
    ["audit_log", "suppress"],
    ["required_tests", "skip"],
    ["approval", "bypass"],
  ] as const)("rejects %s control outcome %s", (control, outcome) => {
    const modified = controls().map((item) => item.control === control ? { ...item, outcome } : item)
    expect(authorize({ controls: modified })).toEqual({ status: "blocked", reasonCode: "mandatory_control_bypass" })
  })

  it("rejects missing, duplicate, weakened, and lineage-mismatched controls", () => {
    expect(authorize({ controls: controls().slice(1) })).toEqual({ status: "blocked", reasonCode: "mandatory_control_missing" })
    expect(authorize({ controls: [...controls(), controls()[0]] })).toEqual({ status: "blocked", reasonCode: "mandatory_control_invalid" })
    expect(authorize({ controls: controls().map((item, index) => index === 0 ? { ...item, proposedLevel: "optional" } : item) }))
      .toEqual({ status: "blocked", reasonCode: "mandatory_control_weakened" })
    expect(authorize({ controls: controls().map((item, index) => index === 0 ? { ...item, proposalFingerprint: "proposal:other" } : item) }))
      .toEqual({ status: "blocked", reasonCode: "mandatory_control_scope_mismatch" })
  })

  it.each([
    [undefined, "activation_confirmation_missing"],
    [{ claimState: "active" }, "activation_confirmation_missing"],
    [activationClaim({ proposalFingerprint: "proposal:other" }), "activation_scope_mismatch"],
    [activationClaim({ sourceChecksum: "source:other" }), "activation_source_mismatch"],
    [activationClaim({ runtimeTargetFingerprint: "runtime:other" }), "activation_runtime_mismatch"],
    [activationClaim({ completeActivation: { ...completeActivation, activationId: "activation:other" } }), "activation_evidence_mismatch"],
  ] as const)("rejects unconfirmed or mismatched active claim %#", (claim, reasonCode) => {
    expect(authorize({ activationClaim: claim })).toEqual({ status: "blocked", reasonCode })
  })

  it.each(["proposed", "validated", "approved"] as const)("allows truthful non-active claim %s without activation evidence", (claimState) => {
    expect(authorize({ activationClaim: { claimState } })).toMatchObject({
      status: "authorized",
      receipt: { activationState: claimState, activationId: undefined },
    })
  })

  it("projects only exact current safety-review lineage", () => {
    const decision = authorize()
    if (decision.status !== "authorized") throw new Error("Expected safety invariant authorization.")
    expect(projectSafetyRulesInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:1391",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toMatchObject({ status: "authorized", review: { invariant: "safety_rules", decision: "preserved" } })
    expect(projectSafetyRulesInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:other",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toEqual({ status: "blocked", reasonCode: "safety_review_scope_mismatch" })
  })

  it("uses only injected rules, control receipts, and activation evidence", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-safety-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
