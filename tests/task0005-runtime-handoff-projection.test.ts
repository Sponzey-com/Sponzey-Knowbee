import { describe, expect, it } from "vitest"
import {
  buildRuntimeWorkHandoffPackage,
  CONTRACT_SCHEMA_VERSION,
  validateWorkHandoffPackage,
  type LlmRequestDiagnosisRecord,
  type RuntimeWorkHandoffProjectionInput,
  type WorkStepPlanItem,
} from "../packages/core/src/contracts/index.ts"
import { validateCommandRequest } from "../packages/core/src/contracts/sub-agent-orchestration.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The parent should delegate a focused implementation step.",
  intent: "runtime_delegation",
  goal: "Prepare and execute one sub-agent task.",
  constraints: ["Keep memory exchange explicit."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "A sub-agent can complete this scoped work.",
}

function projectionInput(
  overrides: Partial<RuntimeWorkHandoffProjectionInput> = {},
): RuntimeWorkHandoffProjectionInput {
  return {
    command: {
      commandRequestId: "command:parent-run:task-1",
      subSessionId: "sub-session-1",
      targetAgentId: "agent:dev",
      targetAgentNameSnapshot: "개발자",
      contextPackageIds: ["context-1"],
      taskScope: {
        goal: "Implement the focused change.",
        intentType: "implementation",
        actionType: "code_change",
        constraints: ["Do not edit unrelated files."],
        reasonCodes: ["delegated_sub_agent"],
        expectedOutputs: [{
          outputId: "patch-summary",
          kind: "text",
          description: "Patch summary and verification result.",
          required: true,
          acceptance: {
            requiredEvidenceKinds: ["test_result"],
            artifactRequired: false,
            reasonCodes: ["targeted_test_passed"],
          },
        }],
      },
    },
    parentWorkId: "work-parent-1",
    parentStepId: "step-parent-1",
    parentAgentName: "마당쇠",
    targetAgentName: "개발자",
    userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
    requestDiagnosis,
    context: ["Use the repository state available to the child run."],
    allowedTools: ["filesystem", "vitest"],
    disallowedActions: ["Do not expose secrets."],
    qualityCriteria: ["Focused diff", "Targeted tests pass"],
    validationMethod: "Run the targeted contract tests.",
    retryLimit: 2,
    stopCondition: "Stop when the focused change is verified or the retry limit is reached.",
    ...overrides,
  }
}

describe("task0005 runtime handoff projection", () => {
  it("validates targetAgentNameSnapshot on command requests", () => {
    const command = {
      identity: {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        entityType: "sub_session",
        entityId: "sub-session-1",
        owner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
        idempotencyKey: "command-request:test",
        parent: { parentRunId: "run:test" },
      },
      commandRequestId: "command:parent-run:task-1",
      parentRunId: "run:test",
      subSessionId: "sub-session-1",
      targetAgentId: "agent:dev",
      targetAgentName: "개발자",
      targetAgentNameSnapshot: "개발자",
      taskScope: projectionInput().command.taskScope,
      contextPackageIds: ["context-1"],
      expectedOutputs: projectionInput().command.taskScope.expectedOutputs,
    }

    expect(validateCommandRequest(command).ok).toBe(true)
    const invalid = validateCommandRequest({
      ...command,
      targetAgentName: "   ",
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.targetAgentName" }),
    ]))
  })

  it("projects existing runtime command data into a valid work handoff package", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput())

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return

    expect(result.value.handoff_id).toBe("handoff:command:parent-run:task-1")
    expect(result.value.work_id).toBe("work:sub-session-1")
    expect(result.value.parent_work_id).toBe("work-parent-1")
    expect(result.value.parent_step_id).toBe("step-parent-1")
    expect(result.value.parent_agent_name).toBe("마당쇠")
    expect(result.value.target_agent_name).toBe("개발자")
    expect(result.value.memory_visibility).toBe("explicit_handoff_only")
    expect(result.value.return_format).toBe("ChildWorkResult")
    expect(result.value.deadline_or_budget).toBe("No explicit deadline or budget.")
    expect(result.value.context).toContain("context:context-1")

    const handoffValidation = validateWorkHandoffPackage(result.value)
    expect(handoffValidation.ok, JSON.stringify(handoffValidation.issues, null, 2)).toBe(true)
  })

  it("rejects runtime handoff projection with implicit memory visibility", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      memoryVisibility: "share_all",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.memoryVisibility",
      code: "contract_validation_failed",
      message: "memoryVisibility must be explicit_handoff_only.",
    })
  })

  it("rejects runtime handoff projection with non-child-result return format", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      returnFormat: "plain_text",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.returnFormat",
      code: "contract_validation_failed",
      message: "returnFormat must be ChildWorkResult.",
    })
  })

  it("rejects runtime handoff projection that targets the parent agent", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      targetAgentName: "마당쇠",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.targetAgentName",
      code: "contract_validation_failed",
      message: "targetAgentName must differ from parentAgentName.",
    })
  })

  it("rejects runtime handoff projection with negative retry limit", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      retryLimit: -1,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retryLimit",
      code: "contract_validation_failed",
      message: "retryLimit must be a non-negative integer.",
    })
  })

  it("rejects runtime handoff projection with fractional retry limit", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      retryLimit: 1.5,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retryLimit",
      code: "contract_validation_failed",
      message: "retryLimit must be a non-negative integer.",
    })
  })

  it("rejects runtime handoff projection whose recovery policy names no changed dimension", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      failureRecoveryPolicy: "Retry differently after failure.",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_recovery_policy",
      code: "contract_validation_failed",
      message: "failure_recovery_policy must name at least one recovery changed dimension.",
    })
  })

  it("builds a default child step when runtime did not provide an explicit step plan", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput())

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.current_step.step_id).toBe("step-parent-1:delegate")
    expect(result.value.current_step.input_refs).toContain("work:work-parent-1")
    expect(result.value.current_step.input_refs).toContain("command:command:parent-run:task-1")
  })

  it("uses command targetAgentNameSnapshot when projecting target names", () => {
    const base = projectionInput()
    const result = buildRuntimeWorkHandoffPackage({
      ...base,
      targetAgentName: undefined,
      command: {
        ...base.command,
        targetAgentNameSnapshot: "새 개발자",
      },
    })

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.target_agent_name).toBe("새 개발자")
    expect(result.value.current_step.owner_agent_name).toBe("새 개발자")
  })

  it("rejects a current step id that is not in the projected step plan", () => {
    const step: WorkStepPlanItem = {
      step_id: "child-step-1",
      owner_agent_name: "개발자",
      action_type: "delegate",
      input_refs: ["work-parent-1"],
      expected_output: "Patch summary.",
      completion_criteria: "Tests pass.",
      status: "pending",
    }

    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      stepPlan: [step],
      currentStepId: "missing-step",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.step_id",
      code: "contract_validation_failed",
      message: "currentStepId must reference a step in stepPlan.",
    })
  })

  it("fails projection when the current step owner is not the target agent", () => {
    const step: WorkStepPlanItem = {
      step_id: "child-step-1",
      owner_agent_name: "검증자",
      action_type: "delegate",
      input_refs: ["work-parent-1"],
      expected_output: "Patch summary.",
      completion_criteria: "Tests pass.",
      status: "pending",
    }

    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      stepPlan: [step],
      currentStepId: step.step_id,
      targetAgentName: "개발자",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.owner_agent_name",
      code: "contract_validation_failed",
      message: "current_step.owner_agent_name must match target_agent_name.",
    })
  })

  it("fails through the handoff validator when request diagnosis is missing", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      requestDiagnosis: undefined as never,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.request_diagnosis" }),
    ]))
  })

  it("fails projection when request diagnosis does not recommend delegation", () => {
    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      requestDiagnosis: {
        ...requestDiagnosis,
        recommended_action: "direct_answer",
        reason: "The parent should answer directly.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.recommended_action",
      code: "contract_validation_failed",
      message: "Work handoff request diagnosis must recommend delegate.",
    })
  })

  it("fails projection when the current step is not a delegation step", () => {
    const step: WorkStepPlanItem = {
      step_id: "child-step-1",
      owner_agent_name: "개발자",
      action_type: "direct_answer",
      input_refs: ["work-parent-1"],
      expected_output: "Answer without child delegation.",
      completion_criteria: "The parent can answer directly.",
      status: "pending",
    }

    const result = buildRuntimeWorkHandoffPackage(projectionInput({
      stepPlan: [step],
      currentStepId: step.step_id,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.action_type",
      code: "contract_validation_failed",
      message: "Work handoff current step action_type must be delegate.",
    })
  })
})
