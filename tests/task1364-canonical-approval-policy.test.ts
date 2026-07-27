import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  applyCanonicalApprovedChange,
  decideDefaultRiskApprovalPolicy,
  validateCanonicalApprovalRequest,
  type CanonicalApprovalRequest,
  type DefaultRiskApprovalReceipt,
} from "../packages/core/src/contracts/canonical-approval-policy.ts"
import {
  PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES,
  REQUIRED_HARNESS_GUARDRAILS,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const proposal = "proposal:1364"

function request(changeKind: CanonicalApprovalRequest["changeKind"] = "prompt_source"): CanonicalApprovalRequest {
  return {
    changeKind,
    targetFiles: [{ sourceKind: "prompt_source_file", sourceRef: "prompts/system.md", baselineVersion: "git:abc1234", baselineChecksum: "aaaaaaaa", proposedChecksum: "bbbbbbbb" }],
    changeSummary: "Update exact system behavior.",
    riskLevel: changeKind === "harness" ? "high" : "medium",
    invariantsAffected: ["identity", "approval"],
    testsToRun: ["prompt-regression", "rollback"],
    rollbackPlan: "Restore baseline checksum.",
    activationMethod: "restart",
    ...(changeKind === "harness" ? {
      harnessChangeScope: ["state_machine"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
    } : {}),
  }
}

function approval(overrides: Partial<DefaultRiskApprovalReceipt> = {}): DefaultRiskApprovalReceipt {
  return {
    decision: "approved",
    actorType: "user",
    actorId: "user:owner",
    explicitApproval: true,
    proposalFingerprint: proposal,
    ...overrides,
  }
}

describe("task1364 canonical approval policy", () => {
  it.each(["prompt_source", "harness"] as const)("validates complete canonical %s approval request", (changeKind) => {
    expect(validateCanonicalApprovalRequest(request(changeKind))).toMatchObject({ status: "valid" })
  })

  it.each([
    ["targetFiles", []],
    ["changeSummary", ""],
    ["invariantsAffected", []],
    ["testsToRun", []],
    ["rollbackPlan", ""],
    ["activationMethod", ""],
  ] as const)("blocks missing canonical approval field %s", async (field, value) => {
    const apply = vi.fn()
    const requestDecision = validateCanonicalApprovalRequest({ ...request(), [field]: value } as CanonicalApprovalRequest)
    expect(requestDecision.status).toBe("blocked")
    await applyCanonicalApprovedChange({ requestDecision, riskDecision: { status: "authorized", risk: "medium", approvalMode: "user_or_administrator" }, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("blocks duplicate tests and invariants", () => {
    expect(validateCanonicalApprovalRequest({ ...request(), testsToRun: ["same", "same"] })).toEqual({ status: "blocked", reasonCode: "approval_list_invalid", field: "testsToRun" })
    expect(validateCanonicalApprovalRequest({ ...request(), invariantsAffected: ["same", "same"] })).toEqual({ status: "blocked", reasonCode: "approval_list_invalid", field: "invariantsAffected" })
  })

  it("forbids harness-only fields on ordinary prompt approval", () => {
    expect(validateCanonicalApprovalRequest({ ...request(), harnessChangeScope: ["state_machine"] }))
      .toEqual({ status: "blocked", reasonCode: "harness_field_forbidden" })
  })

  it.each(REQUIRED_HARNESS_GUARDRAILS)("requires harness guardrail %s", (guardrail) => {
    expect(validateCanonicalApprovalRequest({
      ...request("harness"),
      harnessGuardrailsToPreserve: REQUIRED_HARNESS_GUARDRAILS.filter((item) => item !== guardrail),
    })).toEqual({ status: "blocked", reasonCode: "harness_guardrail_missing", guardrail })
  })

  it("requires unique supported harness scope and guardrails", () => {
    expect(validateCanonicalApprovalRequest({ ...request("harness"), harnessChangeScope: [] }))
      .toEqual({ status: "blocked", reasonCode: "harness_scope_required" })
    expect(validateCanonicalApprovalRequest({ ...request("harness"), harnessChangeScope: ["state_machine", "state_machine"] }))
      .toEqual({ status: "blocked", reasonCode: "harness_scope_invalid" })
    expect(PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES).toContain("state_machine")
  })

  it("allows low risk only with tests and rollback evidence", () => {
    expect(decideDefaultRiskApprovalPolicy({ risk: "low", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal }))
      .toEqual({ status: "authorized", risk: "low", approvalMode: "tests_and_rollback" })
    expect(decideDefaultRiskApprovalPolicy({ risk: "low", testsPassed: false, rollbackAvailable: true, expectedProposalFingerprint: proposal }))
      .toEqual({ status: "blocked", reasonCode: "low_evidence_required" })
    expect(decideDefaultRiskApprovalPolicy({ risk: "low", testsPassed: true, rollbackAvailable: false, expectedProposalFingerprint: proposal }))
      .toEqual({ status: "blocked", reasonCode: "low_evidence_required" })
  })

  it.each(["user", "administrator"] as const)("allows medium risk only with %s approval", (actorType) => {
    expect(decideDefaultRiskApprovalPolicy({ risk: "medium", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal, approval: approval({ actorType }) }))
      .toEqual({ status: "authorized", risk: "medium", approvalMode: "user_or_administrator" })
  })

  it("requires explicit user or administrator approval for high risk", async () => {
    const apply = vi.fn()
    const requestDecision = validateCanonicalApprovalRequest(request("harness"))
    const noApproval = decideDefaultRiskApprovalPolicy({ risk: "high", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal })
    const implicit = decideDefaultRiskApprovalPolicy({ risk: "high", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal, approval: approval({ explicitApproval: false }) })
    const system = decideDefaultRiskApprovalPolicy({ risk: "high", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal, approval: approval({ actorType: "system" }) })
    const approved = decideDefaultRiskApprovalPolicy({ risk: "high", testsPassed: true, rollbackAvailable: true, expectedProposalFingerprint: proposal, approval: approval() })
    expect(noApproval).toEqual({ status: "blocked", reasonCode: "approval_required" })
    expect(implicit).toEqual({ status: "blocked", reasonCode: "explicit_approval_required" })
    expect(system).toEqual({ status: "blocked", reasonCode: "approval_actor_invalid" })
    expect(approved).toEqual({ status: "authorized", risk: "high", approvalMode: "explicit" })
    for (const riskDecision of [noApproval, implicit, system]) await applyCanonicalApprovedChange({ requestDecision, riskDecision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("uses canonical manifests and injected receipts without runtime configuration", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/canonical-approval-policy.ts", import.meta.url), "utf8")
    expect(source).toContain("REQUIRED_HARNESS_GUARDRAILS")
    expect(source).toContain("PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|loadConfig|globalThis/u)
  })
})
