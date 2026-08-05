import { describe, expect, it, vi } from "vitest"
import {
  createStructuredDelegationHandoff,
  resolveWorkRecordWithOneShotRepair,
  validateChildWorkResult,
  validateWorkRecord,
  type ChildWorkResult,
  type WorkRecord,
  type WorkRecordSchemaRepairProvider,
} from "../packages/core/src/contracts/index.ts"

function runningRecord(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "parent-work",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "Verify the requested repository change.",
    request_diagnosis: {
      diagnosis_summary: "The request requires repository verification.",
      intent: "repository_verification",
      goal: "Verify the requested repository change.",
      constraints: ["Keep unrelated files unchanged."],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The verification requires an explicit step.",
    },
    step_plan: [{
      step_id: "verify",
      owner_agent_name: "마당쇠",
      action_type: "validate",
      input_refs: ["request:1"],
      expected_output: "A verified repository result.",
      completion_criteria: "The result includes test evidence.",
      status: "running",
    }],
    step_results: [],
    result_diagnosis: {
      diagnosis_summary: "Verification is still running.",
      sufficiency: "unknown",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "low",
      recommended_action: "plan",
      reason: "No verified result exists yet.",
    },
    retry_count: 0,
    retry_limit: 1,
    stop_condition: "Stop after one changed recovery attempt.",
    action_decision: {
      selected_action: "plan",
      reason: "Continue the current verification step.",
      next_step_id: "verify",
    },
  }
}

function completedChild(): ChildWorkResult {
  return {
    schemaVersion: 1,
    work_id: "child-work",
    agent_name: "검증이",
    task_goal: "Verify the requested repository change.",
    status: "completed",
    completed_steps: ["verify"],
    failed_steps: [],
    summary: "Verification completed.",
    result: "The repository change passed its tests.",
    evidence: ["test:verification"],
    assumptions: [],
    risks: [],
    missing_information: [],
    actions_taken: ["Ran the focused tests."],
    tools_used: ["vitest"],
    result_diagnosis: {
      diagnosis_summary: "The result is sufficient.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The completion criterion has evidence.",
    },
    action_decision: {
      selected_action: "final_report",
      reason: "Return the verified result to the parent.",
    },
    failure_diagnosis: null,
    recovery_attempts: [],
    needs_parent_review: true,
    recommended_next_step: "Parent review and aggregation.",
  }
}

describe("task1274 WorkRecord repair, internal text, and child projection", () => {
  it("uses zero repairs for a valid WorkRecord candidate", async () => {
    const provider: WorkRecordSchemaRepairProvider = { repairWorkRecord: vi.fn() }

    const result = await resolveWorkRecordWithOneShotRepair({
      provider,
      baseline: runningRecord(),
      candidate: runningRecord(),
      failedStepId: "verify",
    })

    expect(provider.repairWorkRecord).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: "valid", repairAttempted: false })
  })

  it("accepts one valid repaired WorkRecord", async () => {
    const repaired = runningRecord()
    const provider: WorkRecordSchemaRepairProvider = {
      repairWorkRecord: vi.fn().mockResolvedValue(repaired),
    }

    const result = await resolveWorkRecordWithOneShotRepair({
      provider,
      baseline: runningRecord(),
      candidate: { ...runningRecord(), status: "invalid" },
      failedStepId: "verify",
    })

    expect(provider.repairWorkRecord).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ status: "valid", repairAttempted: true, record: repaired })
  })

  it("blocks the failed step after one invalid repair without retaining raw output", async () => {
    const provider: WorkRecordSchemaRepairProvider = {
      repairWorkRecord: vi.fn().mockResolvedValue({ raw_output: "repaired-secret" }),
    }

    const result = await resolveWorkRecordWithOneShotRepair({
      provider,
      baseline: runningRecord(),
      candidate: { ...runningRecord(), raw_prompt: "initial-secret" },
      failedStepId: "verify",
    })

    expect(provider.repairWorkRecord).toHaveBeenCalledTimes(1)
    expect(result.status).toBe("blocked")
    if (result.status !== "blocked") return
    expect(result.record).toMatchObject({
      status: "blocked",
      step_plan: [expect.objectContaining({ step_id: "verify", status: "blocked" })],
      step_results: [expect.objectContaining({ step_id: "verify", status: "blocked", error: "invalid_structured_record" })],
      failure_diagnosis: expect.objectContaining({
        failed_step_id: "verify",
        failure_reason: "invalid_structured_record",
        recoverable: false,
      }),
      action_decision: expect.objectContaining({ selected_action: "stop_blocked" }),
    })
    expect(validateWorkRecord(result.record).ok).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/initial-secret|repaired-secret/)
  })

  it("blocks provider failure and repaired identity changes after the single attempt", async () => {
    const throwingProvider: WorkRecordSchemaRepairProvider = {
      repairWorkRecord: vi.fn().mockRejectedValue(new Error("provider-secret")),
    }
    const thrown = await resolveWorkRecordWithOneShotRepair({
      provider: throwingProvider,
      baseline: runningRecord(),
      candidate: { invalid: true },
      failedStepId: "verify",
    })
    expect(throwingProvider.repairWorkRecord).toHaveBeenCalledTimes(1)
    expect(thrown.status).toBe("blocked")
    expect(JSON.stringify(thrown)).not.toContain("provider-secret")

    const changedIdentity = { ...runningRecord(), work_id: "other-work" }
    const identityProvider: WorkRecordSchemaRepairProvider = {
      repairWorkRecord: vi.fn().mockResolvedValue(changedIdentity),
    }
    const changed = await resolveWorkRecordWithOneShotRepair({
      provider: identityProvider,
      baseline: runningRecord(),
      candidate: { invalid: true },
      failedStepId: "verify",
    })
    expect(identityProvider.repairWorkRecord).toHaveBeenCalledTimes(1)
    expect(changed.status).toBe("blocked")
    if (changed.status !== "blocked") return
    expect(changed.validationIssues).toContainEqual(expect.objectContaining({ path: "$.work_id" }))
  })

  it("accepts natural language at the exact limit and rejects unknown prose fields", () => {
    const bounded = runningRecord()
    bounded.request_diagnosis.diagnosis_summary = "x".repeat(500)
    expect(validateWorkRecord(bounded).ok).toBe(true)

    const unknown = { ...bounded, analysis_note: "hidden reasoning" }
    const validation = validateWorkRecord(unknown)
    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues).toContainEqual(expect.objectContaining({ path: "$.analysis_note" }))
  })

  it("rejects overlong WorkRecord natural language without truncation", () => {
    const record = runningRecord()
    record.request_diagnosis.diagnosis_summary = "x".repeat(501)

    const validation = validateWorkRecord(record)

    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues).toContainEqual(expect.objectContaining({
      path: "$.request_diagnosis.diagnosis_summary",
      code: "structured_text_limit_exceeded",
    }))
  })

  it("rejects overlong ChildWorkResult summary and aggregate prose arrays", () => {
    const child = completedChild()
    child.summary = "x".repeat(501)
    child.actions_taken = Array.from({ length: 9 }, (_, index) => `${index}:${"a".repeat(500)}`)

    const validation = validateChildWorkResult(child)

    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.summary", code: "structured_text_limit_exceeded" }),
      expect.objectContaining({ path: "$.actions_taken", code: "structured_text_aggregate_exceeded" }),
    ]))
  })

  it("projects a child handoff only from validated parent fields and explicit references", () => {
    const parent = runningRecord()
    parent.request_diagnosis.recommended_action = "delegate"
    parent.step_plan[0]!.action_type = "delegate"
    parent.action_decision = {
      selected_action: "delegate",
      reason: "Delegate the verification to the direct child.",
      next_step_id: "verify",
    }
    const handoff = createStructuredDelegationHandoff({
      decision: {
        outcome: "delegate",
        reasonCode: "delegation_justified",
        benefitKinds: ["independent_review"],
        targetAgentName: "검증이",
      },
      parentRecord: parent,
      parentStepId: "verify",
      childWorkId: "child-work",
      handoffId: "handoff-1",
      explicitContextRefs: ["artifact:test-report"],
      allowedTools: ["file_read"],
      disallowedActions: ["modify_repository"],
      validationMethod: "Compare the result with the completion criterion.",
      failureRecoveryPolicy: "Retry with a different validation method.",
      deadlineOrBudget: "One review attempt.",
    })

    expect(handoff).toMatchObject({
      work_id: "child-work",
      parent_work_id: "parent-work",
      parent_step_id: "verify",
      parent_agent_name: "마당쇠",
      target_agent_name: "검증이",
      context: ["artifact:test-report"],
      memory_visibility: "explicit_handoff_only",
    })
    expect(handoff.step_plan).toHaveLength(1)
    expect(JSON.stringify(handoff)).not.toMatch(/step_results|private_memory|raw_(?:prompt|transcript|output)/)
  })

  it("rejects invalid parents and raw memory context before handoff creation", () => {
    const args = {
      decision: {
        outcome: "delegate" as const,
        reasonCode: "delegation_justified",
        benefitKinds: ["verification" as const],
        targetAgentName: "검증이",
      },
      parentRecord: runningRecord(),
      parentStepId: "verify",
      childWorkId: "child-work",
      handoffId: "handoff-1",
      explicitContextRefs: ["the user's private memory"],
      allowedTools: [],
      disallowedActions: [],
      validationMethod: "Review the evidence.",
      failureRecoveryPolicy: "Retry with a different validation method.",
      deadlineOrBudget: "One attempt.",
    }
    expect(() => createStructuredDelegationHandoff(args)).toThrow(/typed reference prefix/i)
    expect(() => createStructuredDelegationHandoff({
      ...args,
      explicitContextRefs: [],
      parentRecord: { ...runningRecord(), private_memory: "secret" } as unknown as WorkRecord,
    })).toThrow(/parent work record validation failed/i)
  })

  it("rejects self delegation, reused parent IDs, and missing parent steps", () => {
    const base = {
      decision: {
        outcome: "delegate" as const,
        reasonCode: "delegation_justified",
        benefitKinds: ["verification" as const],
        targetAgentName: "검증이",
      },
      parentRecord: runningRecord(),
      parentStepId: "verify",
      childWorkId: "child-work",
      handoffId: "handoff-1",
      explicitContextRefs: [],
      allowedTools: [],
      disallowedActions: [],
      validationMethod: "Review the evidence.",
      failureRecoveryPolicy: "Retry with a different validation method.",
      deadlineOrBudget: "One attempt.",
    }
    expect(() => createStructuredDelegationHandoff({
      ...base,
      decision: { ...base.decision, targetAgentName: "마당쇠" },
    })).toThrow(/target must differ/i)
    expect(() => createStructuredDelegationHandoff({
      ...base,
      childWorkId: "parent-work",
    })).toThrow(/child work id must differ/i)
    expect(() => createStructuredDelegationHandoff({
      ...base,
      parentStepId: "missing-step",
    })).toThrow(/must reference the parent workrecord step plan/i)
  })
})
