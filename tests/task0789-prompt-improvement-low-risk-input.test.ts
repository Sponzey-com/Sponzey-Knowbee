import { describe, expect, it } from "vitest"
import {
  REQUIRED_HARNESS_GUARDRAILS,
  buildPromptImprovementApprovalRequest,
  validatePromptImprovementHarnessInput,
  type PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function harnessInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Make the final response failure report shorter.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "user_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement.md:sha256:abc123",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Failure reports include repeated background details.",
    desiredBehavior: "Failure reports contain result, reason, and next action only.",
    userReactionEvidence: ["User asked for shorter failure explanations."],
    responseStrategyTarget: "failure_report",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change identity rules."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["identity", "safety", "memory_isolation", "harness_integrity", "audit", "activation_boundary", "rollback"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "user_required",
    approvalRecord: {
      approvedBy: "user:prompt-harness-test",
      approvedAt: "2026-07-04T00:00:00.000Z",
      approvalScope: ["apply_change"],
      targetPromptSources: ["prompts/final_response.md"],
      targetHarnessSources: [],
      riskAccepted: "medium",
    },
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    ...overrides,
  }
}

describe("task0789 low-risk prompt improvement harness input", () => {
  it("allows low-risk prompt-source improvements without approval", () => {
    const input = harnessInput({
      riskLevel: "low",
      impactAssessment: { changeKind: "wording_clarification", impactAxes: [] },
      approvalMode: "none",
      approvalRecord: undefined,
    })

    const result = validatePromptImprovementHarnessInput(input)

    expect(result.ok).toBe(true)
    expect(result.risk).toBe("low")
    expect(result.issues).toEqual([])
  })

  it("rejects low risk when behavior or protected axes are affected", () => {
    for (const impactAssessment of [
      { changeKind: "behavior_change" as const, impactAxes: ["delegation_wording" as const] },
      { changeKind: "wording_clarification" as const, impactAxes: ["memory" as const] },
    ]) {
      const result = validatePromptImprovementHarnessInput(harnessInput({
        riskLevel: "low",
        impactAssessment,
        approvalMode: "none",
        approvalRecord: undefined,
      }))
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "proposal_risk_underclassified",
        path: "riskLevel",
      }))
    }
  })

  it("keeps the existing default non-harness risk at medium", () => {
    const result = validatePromptImprovementHarnessInput(harnessInput({
      approvalMode: "none",
      approvalRecord: undefined,
    }))

    expect(result.risk).toBe("medium")
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "approval_required",
      path: "approvalMode",
    }))
  })

  it("keeps harness improvements high-risk even when the input requests low risk", () => {
    const input = harnessInput({
      improvementKind: "harness_rule",
      riskLevel: "low",
      targetPromptSources: [],
      targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      harnessChangeScope: ["approval_policy"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      approvalMode: "admin_required",
      approvalRecord: {
        approvedBy: "admin:prompt-harness-test",
        approvedAt: "2026-07-04T00:00:00.000Z",
        approvalScope: ["apply_change", "activation"],
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        riskAccepted: "high",
      },
    })

    const validation = validatePromptImprovementHarnessInput(input)
    const request = buildPromptImprovementApprovalRequest({
      harnessInput: input,
      validation,
      changeSummary: "Require explicit entry policy for harness changes.",
      invariantsAffected: ["approval", "activation_confirmation"],
      activationMethod: "registry_activation",
      approvalScopesRequested: ["apply_change"],
    })

    expect(validation.ok).toBe(true)
    expect(validation.risk).toBe("high")
    expect(request.riskLevel).toBe("high")
  })
})
