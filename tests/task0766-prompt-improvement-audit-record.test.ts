import { describe, expect, it } from "vitest"
import {
  buildPromptImprovementAuditRecord,
  buildPromptImprovementHarnessReport,
  buildPromptImprovementProductLogEvents,
  validatePromptImprovementHarnessInput,
  type PromptImprovementApprovalRecord,
  type PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "admin:audit-test",
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
    improvementGoal: "Audit prompt improvement run.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: ["prompts/final_response.md"],
    activeHarnessVersion: "prompt_improvement.md:sha256:audit-test",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["final_response"],
    currentBehavior: "Prompt improvement run lacks a dedicated audit record.",
    desiredBehavior: "Audit record contains required run fields.",
    userReactionEvidence: ["Admin requested audit projection."],
    responseStrategyTarget: "audit_record",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not log raw prompt source text."],
    allowedChangeScope: ["prompts/final_response.md"],
    requiredInvariants: ["audit", "redaction"],
    requiredTests: ["tests/prompt-source-regression.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
    ...overrides,
  }
}

function report() {
  const input = harnessInput()
  return buildPromptImprovementHarnessReport({
    runId: "prompt-improvement:audit",
    harnessInput: input,
    validation: validatePromptImprovementHarnessInput(input),
    sourceWriteState: "written",
    changedPromptSources: ["prompts/final_response.md"],
    backupPath: "backup:prompts/final_response.md.bak",
    sourceChecksums: [{
      sourceRef: "prompts/final_response.md",
      beforeChecksum: "before-checksum",
    }],
    testsPassed: ["tests/prompt-source-regression.test.ts"],
  })
}

describe("task0766 prompt improvement audit record", () => {
  it("builds the required audit record fields from a harness report", () => {
    const audit = buildPromptImprovementAuditRecord(report())

    expect(audit).toEqual({
      runId: "prompt-improvement:audit",
      startedAt: expect.any(Number),
      finishedAt: expect.any(Number),
      actor: "노비",
      triggerSource: "admin_request",
      state: "activation_pending",
      targetPromptSources: ["prompts/final_response.md"],
      changedPromptSources: ["prompts/final_response.md"],
      improvementGoal: "Audit prompt improvement run.",
      behaviorBefore: "Prompt improvement run lacks a dedicated audit record.",
      behaviorAfter: "Audit record contains required run fields.",
      riskLevel: "medium",
      approvalRecord: {
        mode: "admin_required",
        required: true,
        granted: true,
        approvedBy: "admin:audit-test",
        approvedAt: "2026-07-04T00:00:00.000Z",
        approvalScope: ["apply_change"],
        targetPromptSources: ["prompts/final_response.md"],
        targetHarnessSources: [],
        riskAccepted: "medium",
      },
      testsRequested: ["tests/prompt-source-regression.test.ts"],
      testsPassed: ["tests/prompt-source-regression.test.ts"],
      testsFailed: [],
      activationState: "activation_pending",
      rollbackState: "backup_available",
      summary: "Prompt source was written. Runtime activation is pending until reload, restart, or explicit prompt version activation is confirmed.",
    })
  })

  it("clones audit record arrays and approval records", () => {
    const sourceReport = report()
    const audit = buildPromptImprovementAuditRecord(sourceReport)

    sourceReport.targetPromptSources.push("prompts/identity.md")
    sourceReport.approvalRecord.approvalScope.push("activation")

    expect(audit.targetPromptSources).toEqual(["prompts/final_response.md"])
    expect(audit.improvementGoal).toBe("Audit prompt improvement run.")
    expect(audit.behaviorBefore).toContain("lacks a dedicated audit record")
    expect(audit.behaviorAfter).toContain("contains required run fields")
    expect(audit.approvalRecord.approvalScope).toEqual(["apply_change"])
  })

  it("projects minimal product log events without baseline internals or prompt bodies", () => {
    const audit = buildPromptImprovementAuditRecord(report())
    const events = buildPromptImprovementProductLogEvents(audit)

    expect(events.map((event) => event.event)).toEqual([
      "prompt_improvement.started",
      "prompt_improvement.approval_required",
      "prompt_improvement.change_applied",
      "prompt_improvement.activation_state",
      "prompt_improvement.rollback_state",
      "prompt_improvement.finished",
    ])
    expect(events.every((event) => event.level === "product")).toBe(true)
    for (const event of events) {
      expect(event).not.toHaveProperty("baselineCapture")
      expect(event).not.toHaveProperty("sourceChecksums")
      expect(event).not.toHaveProperty("promptBody")
      expect(event).not.toHaveProperty("rawPrompt")
    }
  })
})
