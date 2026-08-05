import { describe, expect, it } from "vitest"
import {
  buildPromptImprovementActivationRecord,
  buildPromptImprovementHarnessReport,
  buildPromptImprovementUserOutput,
  validatePromptImprovementHarnessInput,
  type PromptImprovementApprovalRecord,
  type PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "admin:output-test",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change", "activation"],
    targetPromptSources: ["prompts/final_response.md"],
    targetHarnessSources: [],
    riskAccepted: "medium",
    ...overrides,
  }
}

function harnessInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Make final responses concise.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement.md:sha256:output-test",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Final responses repeat internal details.",
    desiredBehavior: "Final responses state result, reason, and next action.",
    userReactionEvidence: ["User requested concise output."],
    responseStrategyTarget: "final_response",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change identity."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["identity", "memory_isolation"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    ...overrides,
  }
}

describe("task0770 prompt improvement user-facing harness output", () => {
  it("builds activation-pending output with reload or restart still required", () => {
    const input = harnessInput()
    const report = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:user-output-pending",
      harnessInput: input,
      validation: validatePromptImprovementHarnessInput(input),
      sourceWriteState: "written",
      changedPromptSources: ["prompts/final_response.md"],
      backupPath: "backup:prompts/final_response.md.bak",
      sourceChecksums: [{ sourceRef: "prompts/final_response.md", beforeChecksum: "before" }],
      testsPassed: ["tests/prompt-source-regression.test.ts"],
    })

    expect(buildPromptImprovementUserOutput(report)).toEqual({
      state: "activation_pending",
      inspectedPromptSources: ["prompts/final_response.md"],
      changedPromptSources: ["prompts/final_response.md"],
      changeReason: "Make final responses concise.",
      behaviorBefore: "Final responses repeat internal details.",
      behaviorAfter: "Final responses state result, reason, and next action.",
      outcomeSummary: report.summary,
      invariantsChecked: ["identity", "memory_isolation"],
      testsPassed: ["tests/prompt-source-regression.test.ts"],
      testsFailed: [],
      activeNow: false,
      activationState: "activation_pending",
      reloadOrRestartRequired: true,
      rollbackPath: "backup:prompts/final_response.md.bak",
      promptChanged: true,
      noChangeStatement: "",
    })
  })

  it("builds activated output without reload or restart requirement", () => {
    const input = harnessInput()
    const report = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:user-output-activated",
      harnessInput: input,
      validation: validatePromptImprovementHarnessInput(input),
      sourceWriteState: "written",
      changedPromptSources: ["prompts/final_response.md"],
      backupPath: "backup:prompts/final_response.md.bak",
      sourceChecksums: [{ sourceRef: "prompts/final_response.md", beforeChecksum: "before" }],
      testsPassed: ["tests/prompt-source-regression.test.ts"],
      activationRecord: buildPromptImprovementActivationRecord({
        activePromptVersions: [{ sourceRef: "prompts/final_response.md", version: "sha256:after" }],
        loadedByProcess: "gateway:pid:12345",
        loadedByAgentName: "노비",
        activatedAt: "2026-07-04T00:01:00.000Z",
        activationMethod: "reload",
        testsBeforeActivation: ["tests/prompt-source-regression.test.ts"],
        rollbackPath: "backup:prompts/final_response.md.bak",
      }),
    })

    const output = buildPromptImprovementUserOutput(report)

    expect(output.activeNow).toBe(true)
    expect(output.changeReason).toBe("Make final responses concise.")
    expect(output.behaviorBefore).toBe("Final responses repeat internal details.")
    expect(output.behaviorAfter).toBe("Final responses state result, reason, and next action.")
    expect(output.outcomeSummary).toBe(report.summary)
    expect(output.activationState).toBe("activated")
    expect(output.reloadOrRestartRequired).toBe(false)
  })

  it("explicitly reports when no prompt source changed", () => {
    const input = harnessInput()
    const report = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:user-output-unchanged",
      harnessInput: input,
      validation: validatePromptImprovementHarnessInput(input),
      sourceWriteState: "unchanged",
      changedPromptSources: [],
      testsPassed: ["tests/prompt-source-regression.test.ts"],
    })

    const output = buildPromptImprovementUserOutput(report)

    expect(output.promptChanged).toBe(false)
    expect(output.changedPromptSources).toEqual([])
    expect(output.noChangeStatement).toBe("Prompt source was unchanged.")
    expect(output.reloadOrRestartRequired).toBe(false)
  })
})
