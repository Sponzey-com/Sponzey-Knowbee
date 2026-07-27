import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES,
  REQUIRED_HARNESS_GUARDRAILS,
  validatePromptImprovementProposal,
  writeValidatedPromptImprovementProposal,
  type PromptImprovementHarnessInput,
  type PromptImprovementProposal,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function review(notes: string) {
  return { passed: true, notes }
}

function harnessInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Make failure reports concise.",
    improvementKind: "prompt_source",
    riskLevel: "medium",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    triggerSource: "user_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement:sha256:current",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Failure reports repeat background details.",
    desiredBehavior: "Failure reports contain result, reason, and next action.",
    userReactionEvidence: ["feedback:shorter-report"],
    responseStrategyTarget: "failure_report",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change identity rules."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["identity", "safety", "harness_integrity", "audit", "activation_boundary", "rollback"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "user_required",
    approvalRecord: {
      approvedBy: "user:owner",
      approvedAt: "2026-07-14T00:00:00.000Z",
      approvalScope: ["apply_change"],
      targetPromptSources: ["prompts/final_response.md"],
      targetHarnessSources: [],
      riskAccepted: "medium",
    },
    rollbackPlan: "Restore prompts/final_response.md from prompt-registry:final_response:v1.",
    ...overrides,
  }
}

function proposal(overrides: Partial<PromptImprovementProposal> = {}): PromptImprovementProposal {
  return {
    improvementKind: "prompt_source",
    problem: "Failure reports are too long.",
    rootCause: "The final response prompt repeats background details.",
    targetFiles: ["prompts/final_response.md"],
    proposedChangeSummary: "Require concise reason and next action only.",
    expectedBehaviorAfterChange: "Failure reports contain result, reason, and next action.",
    nonGoals: ["Do not change identity rules."],
    invariantsChecked: ["identity", "memory_isolation", "safety", "harness_integrity", "audit", "activation_boundary", "rollback"],
    testsToRun: ["tests/prompt-source-regression.test.ts"],
    riskLevel: "medium",
    impactAssessment: { changeKind: "behavior_change", impactAxes: ["response_style"] },
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    approvalRequired: true,
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    clarityReview: review("Actor, condition, allowed behavior, forbidden behavior, and completion criteria are explicit."),
    brevityReview: review("The proposed rule is concise and does not repeat another module."),
    moduleBoundaryReview: {
      ...review("The rule belongs only to final_response.md."),
      canonicalModuleId: "final_response",
      responsibilityIds: ["final_response"],
      overlappingRuleKeys: [],
    },
    ...overrides,
  }
}

describe("task0767 prompt improvement proposal validator", () => {
  it("accepts a complete structured prompt-source proposal", () => {
    expect(validatePromptImprovementProposal(proposal())).toEqual({
      ok: true,
      issues: [],
    })
  })

  it("rejects medium or high risk proposals without approval and failed review gates", () => {
    const result = validatePromptImprovementProposal(proposal({
      approvalRequired: false,
      clarityReview: { passed: false, notes: "Missing forbidden behavior." },
      moduleBoundaryReview: {
        passed: false,
        notes: "Duplicates identity.md.",
        canonicalModuleId: "final_response",
        responsibilityIds: ["final_response"],
        overlappingRuleKeys: ["identity.self_name"],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "proposal_approval_required", path: "approvalRequired" }),
      expect.objectContaining({ code: "proposal_review_failed", path: "clarityReview" }),
      expect.objectContaining({ code: "proposal_review_failed", path: "moduleBoundaryReview" }),
    ]))
  })

  it("requires evidence-backed clarity and brevity reviews", () => {
    for (const [field, value] of [
      ["clarityReview", { passed: false, notes: "Actor and completion criteria are missing." }],
      ["clarityReview", { passed: true, notes: "" }],
      ["brevityReview", { passed: false, notes: "The proposal repeats an existing rule." }],
      ["brevityReview", { passed: true, notes: "   " }],
    ] as const) {
      const result = validatePromptImprovementProposal(proposal({ [field]: value }))

      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "proposal_review_failed",
        path: field,
      }))
    }
  })

  it("classifies wording-only, behavior, and protected-axis proposal risk floors", () => {
    const wordingOnly = validatePromptImprovementProposal(proposal({
      riskLevel: "low",
      approvalRequired: false,
      impactAssessment: { changeKind: "wording_clarification", impactAxes: [] },
    }))
    expect(wordingOnly.ok).toBe(true)

    for (const impactAssessment of [
      { changeKind: "behavior_change" as const, impactAxes: ["workflow_generation" as const] },
      { changeKind: "wording_clarification" as const, impactAxes: ["identity" as const] },
    ]) {
      const result = validatePromptImprovementProposal(proposal({
        riskLevel: "low",
        approvalRequired: false,
        impactAssessment,
      }))
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "proposal_risk_underclassified",
        path: "riskLevel",
      }))
    }
  })

  it("requires an impact assessment before proposal risk can be accepted", () => {
    const result = validatePromptImprovementProposal({
      ...proposal(),
      impactAssessment: undefined,
    })
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "proposal_impact_assessment_missing",
      path: "impactAssessment",
    }))
  })

  it("rejects non-prompt files for prompt-source proposals", () => {
    const result = validatePromptImprovementProposal(proposal({
      targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "proposal_target_file_invalid_ref",
      path: "targetFiles.0",
    }))
  })

  it("accepts supported prompt source reference forms for prompt-source proposals", () => {
    const registryRef = validatePromptImprovementProposal(proposal({
      targetFiles: ["identity:en"],
    }))
    const fileRef = validatePromptImprovementProposal(proposal({
      targetFiles: ["prompts/final_response.md"],
    }))

    expect(registryRef.issues).not.toContainEqual(expect.objectContaining({
      code: "proposal_target_file_invalid_ref",
    }))
    expect(fileRef.issues).not.toContainEqual(expect.objectContaining({
      code: "proposal_target_file_invalid_ref",
    }))
  })

  it.each([
    "problem",
    "rootCause",
    "proposedChangeSummary",
    "expectedBehaviorAfterChange",
    "rollbackPlan",
  ] as const)("rejects a proposal missing required string %s", (field) => {
    const result = validatePromptImprovementProposal(proposal({ [field]: "" }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "proposal_field_missing",
      path: field,
    }))
  })

  it.each([
    "targetFiles",
    "nonGoals",
    "invariantsChecked",
    "testsToRun",
  ] as const)("rejects a proposal missing required list %s", (field) => {
    const result = validatePromptImprovementProposal(proposal({ [field]: [] }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "proposal_field_missing",
      path: field,
    }))
  })

  it("requires canonical module ownership, responsibility, and no overlap evidence", () => {
    const baseReview = proposal().moduleBoundaryReview
    const cases = [
      [{ ...baseReview, canonicalModuleId: "" }, "moduleBoundaryReview.canonicalModuleId"],
      [{ ...baseReview, responsibilityIds: [] }, "moduleBoundaryReview.responsibilityIds"],
      [{ ...baseReview, overlappingRuleKeys: ["identity.self_name"] }, "moduleBoundaryReview.overlappingRuleKeys"],
    ] as const

    for (const [moduleBoundaryReview, path] of cases) {
      const result = validatePromptImprovementProposal(proposal({ moduleBoundaryReview }))
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "proposal_review_failed",
        path,
      }))
    }
  })

  it("never writes a structurally invalid or boundary-invalid proposal", async () => {
    const write = vi.fn(async () => "saved")
    const blocked = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput(),
      proposal: proposal({
        moduleBoundaryReview: {
          ...proposal().moduleBoundaryReview,
          overlappingRuleKeys: ["identity.self_name"],
        },
      }),
      write,
    })
    expect(blocked).toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()

    await expect(writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput(),
      proposal: proposal(),
      write,
    })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("requires a valid input record before proposal validation and exact matching targets before write", async () => {
    const write = vi.fn(async () => "saved")
    const missingRecord = await writeValidatedPromptImprovementProposal({
      harnessInput: {},
      proposal: proposal(),
      write,
    })
    expect(missingRecord).toMatchObject({
      status: "blocked",
      issues: expect.arrayContaining([expect.objectContaining({ code: "proposal_input_record_invalid" })]),
    })
    const mismatchedTarget = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput({
        targetPromptSources: ["prompts/identity.md"],
        allowedChangeScope: ["prompts/identity.md"],
        agentOwnedPromptScope: ["identity"],
        approvalRecord: {
          ...harnessInput().approvalRecord!,
          targetPromptSources: ["prompts/identity.md"],
        },
      }),
      proposal: proposal(),
      write,
    })
    expect(mismatchedTarget).toMatchObject({
      status: "blocked",
      issues: [{ code: "proposal_input_scope_mismatch", path: "targetFiles" }],
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("requires high risk, scope, and preserved guardrails for harness proposals", () => {
    const result = validatePromptImprovementProposal(proposal({
      improvementKind: "harness_rule",
      targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      riskLevel: "medium",
      harnessChangeScope: [],
      harnessGuardrailsToPreserve: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "proposal_harness_high_risk_required", path: "riskLevel" }),
      expect.objectContaining({ code: "proposal_harness_scope_missing", path: "harnessChangeScope" }),
      expect.objectContaining({ code: "proposal_harness_guardrail_missing", path: "harnessGuardrailsToPreserve" }),
    ]))
  })

  it("requires every canonical harness guardrail to remain preserved", () => {
    const result = validatePromptImprovementProposal(proposal({
      improvementKind: "harness_rule",
      targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      riskLevel: "high",
      harnessChangeScope: ["input_schema"],
      harnessGuardrailsToPreserve: ["approval", "rollback"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "proposal_harness_guardrail_missing",
      path: "harnessGuardrailsToPreserve",
      message: expect.stringContaining("entry_conditions"),
    }))

    expect(validatePromptImprovementProposal(proposal({
      improvementKind: "harness_rule",
      targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
      riskLevel: "high",
      harnessChangeScope: ["input_schema"],
      harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
    })).issues).not.toContainEqual(expect.objectContaining({
      code: "proposal_harness_guardrail_missing",
    }))
  })

  it.each(PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES)(
    "accepts canonical proposal harness scope %s",
    (scope) => {
      const result = validatePromptImprovementProposal(proposal({
        improvementKind: "harness_rule",
        targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        riskLevel: "high",
        harnessChangeScope: [scope],
        harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
      }))
      expect(result.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "harness_change_scope_invalid" }),
        expect.objectContaining({ code: "harness_change_scope_duplicate" }),
      ]))
    },
  )

  it("blocks proposal writes with unsupported or duplicate harness contract values", async () => {
    const write = vi.fn()
    const decision = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput({
        improvementKind: "harness_rule",
        targetPromptSources: [],
        targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        harnessChangeScope: ["input_schema"],
        harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS],
        allowedChangeScope: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        approvalMode: "admin_required",
        approvalRecord: {
          approvedBy: "admin:owner",
          approvedAt: "2026-07-14T00:00:00.000Z",
          approvalScope: ["apply_change", "activation"],
          targetPromptSources: [],
          targetHarnessSources: ["packages/core/src/memory/prompt-improvement-harness.ts"],
          riskAccepted: "high",
        },
      }),
      proposal: proposal({
        improvementKind: "harness_rule",
        targetFiles: ["packages/core/src/memory/prompt-improvement-harness.ts"],
        riskLevel: "high",
        harnessChangeScope: ["input_schema", "input_schema", "unknown_scope"],
        harnessGuardrailsToPreserve: [...REQUIRED_HARNESS_GUARDRAILS, "approval", "unknown_guardrail"],
      }),
      write,
    })

    expect(decision).toMatchObject({ status: "blocked" })
    if (decision.status === "blocked") {
      expect(decision.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "harness_change_scope_duplicate" }),
        expect.objectContaining({ code: "harness_change_scope_invalid" }),
        expect.objectContaining({ code: "harness_guardrail_duplicate" }),
        expect.objectContaining({ code: "harness_guardrail_invalid" }),
      ]))
    }
    expect(write).not.toHaveBeenCalled()
  })

  it("blocks writes when proposal non-goals or invariant checks diverge from validated input", async () => {
    const write = vi.fn()
    const nonGoalMismatch = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput(),
      proposal: proposal({ nonGoals: ["Do not change memory rules."] }),
      write,
    })
    const invariantMismatch = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput(),
      proposal: proposal({ invariantsChecked: ["identity"] }),
      write,
    })

    expect(nonGoalMismatch).toMatchObject({
      status: "blocked",
      issues: [{ code: "proposal_input_non_goals_mismatch", path: "nonGoals" }],
    })
    expect(invariantMismatch).toMatchObject({
      status: "blocked",
      issues: [{ code: "proposal_input_invariants_mismatch", path: "invariantsChecked" }],
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("blocks writes when proposal omits a validated regression test", async () => {
    const write = vi.fn()
    const decision = await writeValidatedPromptImprovementProposal({
      harnessInput: harnessInput({
        requiredTests: ["tests/prompt-source-regression.test.ts", "tests/task0767-prompt-improvement-proposal-validator.test.ts"],
      }),
      proposal: proposal({ testsToRun: ["tests/prompt-source-regression.test.ts"] }),
      write,
    })
    expect(decision).toMatchObject({
      status: "blocked",
      issues: [{ code: "proposal_input_tests_mismatch", path: "testsToRun" }],
    })
    expect(write).not.toHaveBeenCalled()
  })
})
