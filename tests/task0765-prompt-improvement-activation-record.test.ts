import { describe, expect, it } from "vitest"
import {
  buildPromptImprovementActivationRecord,
  buildPromptImprovementHarnessReport,
  validatePromptImprovementActivationRecord,
  validatePromptImprovementHarnessInput,
  type PromptImprovementApprovalRecord,
  type PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "admin:activation-test",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change"],
    targetPromptSources: ["prompts/final_response.md"],
    targetHarnessSources: [],
    riskAccepted: "medium",
    ...overrides,
  }
}

function harnessInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Confirm runtime activation after prompt write.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement.md:sha256:activation-test",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Prompt source was written but not confirmed active.",
    desiredBehavior: "Activation report identifies the loaded prompt version.",
    userReactionEvidence: ["Admin requested activation confirmation."],
    responseStrategyTarget: "activation_report",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not imply activation from file writes."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["activation_boundary", "rollback"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    ...overrides,
  }
}

describe("task0765 prompt improvement activation confirmation record", () => {
  it("builds and validates a complete activation confirmation record", () => {
    const record = buildPromptImprovementActivationRecord({
      activePromptVersions: [{
        sourceRef: "prompts/final_response.md",
        version: "sha256:after",
        checksum: "after-checksum",
      }],
      loadedByProcess: "gateway:pid:12345",
      loadedByAgentName: "노비",
      activatedAt: "2026-07-04T00:01:00.000Z",
      activationMethod: "reload",
      testsBeforeActivation: ["tests/prompt-source-regression.test.ts"],
      rollbackPath: "backup:prompts/final_response.md.bak",
    })

    expect(validatePromptImprovementActivationRecord(record)).toEqual({
      ok: true,
      issues: [],
    })
    expect(record).toMatchObject({
      state: "activated",
      activePromptVersions: [{
        sourceRef: "prompts/final_response.md",
        version: "sha256:after",
        checksum: "after-checksum",
      }],
      loadedByProcess: "gateway:pid:12345",
      loadedByAgentName: "노비",
      activationMethod: "reload",
      testsBeforeActivation: ["tests/prompt-source-regression.test.ts"],
      rollbackPath: "backup:prompts/final_response.md.bak",
    })
  })

  it("rejects incomplete activation confirmation records", () => {
    const result = validatePromptImprovementActivationRecord({
      state: "activated",
      activePromptVersions: [],
      loadedByProcess: "",
      loadedByAgentName: "",
      activatedAt: "",
      activationMethod: "" as never,
      testsBeforeActivation: [],
      rollbackPath: "",
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "activation_source_missing", path: "activePromptVersions" }),
      expect.objectContaining({ code: "activation_loader_missing", path: "loadedByProcess" }),
      expect.objectContaining({ code: "activation_loader_missing", path: "loadedByAgentName" }),
      expect.objectContaining({ code: "activation_timestamp_missing", path: "activatedAt" }),
      expect.objectContaining({ code: "activation_method_missing", path: "activationMethod" }),
      expect.objectContaining({ code: "activation_test_evidence_missing", path: "testsBeforeActivation" }),
      expect.objectContaining({ code: "activation_rollback_missing", path: "rollbackPath" }),
    ]))
  })

  it("marks reports activated only when a valid activation record is present", () => {
    const input = harnessInput()
    const validation = validatePromptImprovementHarnessInput(input)
    const activationRecord = buildPromptImprovementActivationRecord({
      activePromptVersions: [{
        sourceRef: "prompts/final_response.md",
        version: "sha256:after",
      }],
      loadedByProcess: "gateway:pid:12345",
      loadedByAgentName: "노비",
      activatedAt: "2026-07-04T00:01:00.000Z",
      activationMethod: "restart",
      testsBeforeActivation: ["tests/prompt-source-regression.test.ts"],
      rollbackPath: "git:HEAD~1",
    })

    const pending = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:activation-pending",
      harnessInput: input,
      validation,
      sourceWriteState: "written",
      changedPromptSources: ["prompts/final_response.md"],
      backupPath: "backup:prompts/final_response.md.bak",
      sourceChecksums: [{ sourceRef: "prompts/final_response.md", beforeChecksum: "before-checksum" }],
    })
    const activated = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:activated",
      harnessInput: input,
      validation,
      sourceWriteState: "written",
      changedPromptSources: ["prompts/final_response.md"],
      rollbackTarget: "git:HEAD~1",
      sourceChecksums: [{ sourceRef: "prompts/final_response.md", beforeChecksum: "before-checksum" }],
      activationRecord,
    })

    expect(pending.activationState).toBe("activation_pending")
    expect(pending.state).toBe("activation_pending")
    expect(pending.activationRecord).toBeUndefined()
    expect(activated.activationState).toBe("activated")
    expect(activated.state).toBe("completed")
    expect(activated.activationRecord).toEqual(activationRecord)
  })

  it("blocks written reports that lack baseline checksum or rollback target evidence", () => {
    const input = harnessInput()
    const validation = validatePromptImprovementHarnessInput(input)
    const missingBaseline = buildPromptImprovementHarnessReport({
      runId: "prompt-improvement:missing-baseline",
      harnessInput: input,
      validation,
      sourceWriteState: "written",
      changedPromptSources: ["prompts/final_response.md"],
    })

    expect(missingBaseline.state).toBe("blocked")
    expect(missingBaseline.activationState).toBe("activation_pending")
    expect(missingBaseline.baselineIntegrityIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "baseline_source_checksum_missing", path: "sourceChecksums" }),
      expect.objectContaining({ code: "baseline_rollback_target_missing", path: "rollbackTarget" }),
    ]))
    expect(missingBaseline.baselineCapture.sourceChecksums).toEqual([])
    expect(missingBaseline.baselineCapture.rollbackTarget).toBe("")
  })
})
