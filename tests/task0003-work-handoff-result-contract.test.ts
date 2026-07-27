import { describe, expect, it } from "vitest"
import {
  validateChildWorkResult,
  validateWorkHandoffPackage,
  type ChildWorkResult,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type WorkHandoffPackage,
  type WorkStepPlanItem,
} from "../packages/core/src/contracts/work-record.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The parent needs a focused implementation step.",
  intent: "delegated_work",
  goal: "Implement and verify one step.",
  constraints: ["Do not change unrelated files."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "A child agent has the required role.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result satisfies the requested step.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The result matches the quality criteria.",
}

const step: WorkStepPlanItem = {
  step_id: "step-1",
  owner_agent_name: "개발자",
  action_type: "delegate",
  input_refs: ["parent-work"],
  expected_output: "Patch and test summary.",
  completion_criteria: "Tests pass and changes are summarized.",
  status: "pending",
}

function handoff(overrides: Partial<WorkHandoffPackage> = {}): WorkHandoffPackage {
  return {
    schemaVersion: 1,
    handoff_id: "handoff-1",
    work_id: "work-child-1",
    parent_work_id: "work-parent-1",
    parent_step_id: "step-parent-1",
    parent_agent_name: "노비",
    target_agent_name: "개발자",
    task_goal: "Implement one focused change.",
    user_request_summary: "사용자가 기능 구현을 요청했습니다.",
    request_diagnosis: requestDiagnosis,
    step_plan: [step],
    current_step: step,
    context: ["Use the current repository state."],
    constraints: ["Do not revert user changes."],
    allowed_tools: ["filesystem", "tests"],
    disallowed_actions: ["secret exposure"],
    expected_output: "Implementation result and verification summary.",
    quality_criteria: ["Focused diff", "Tests pass"],
    validation_method: "Run targeted tests.",
    retry_limit: 2,
    stop_condition: "Stop when the requested result is verified or the retry limit is reached.",
    failure_recovery_policy: "Change input, strategy, tool, target, permission, scope, or validation before retry.",
    deadline_or_budget: "No explicit deadline or budget.",
    memory_visibility: "explicit_handoff_only",
    return_format: "ChildWorkResult",
    ...overrides,
  }
}

function childResult(overrides: Partial<ChildWorkResult> = {}): ChildWorkResult {
  return {
    schemaVersion: 1,
    work_id: "work-child-1",
    agent_name: "개발자",
    task_goal: "Implement one focused change.",
    status: "completed",
    completed_steps: ["step-1"],
    failed_steps: [],
    summary: "Implemented and verified the focused change.",
    result: "Patch applied.",
    evidence: ["targeted tests passed"],
    assumptions: [],
    risks: [],
    missing_information: [],
    actions_taken: ["edited file", "ran test"],
    tools_used: ["filesystem", "vitest"],
    result_diagnosis: resultDiagnosis,
    action_decision: {
      selected_action: "final_report",
      reason: "The child output is ready for parent review.",
    },
    failure_diagnosis: null,
    recovery_attempts: [],
    needs_parent_review: true,
    recommended_next_step: "Parent should review and aggregate.",
    ...overrides,
  }
}

describe("task0003 work handoff/result contract", () => {
  it("validates a work-record based handoff package", () => {
    const result = validateWorkHandoffPackage(handoff())

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects handoff packages whose current step is not in the step plan", () => {
    const result = validateWorkHandoffPackage(handoff({
      current_step: { ...step, step_id: "missing-step" },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.step_id",
      code: "contract_validation_failed",
      message: "current_step.step_id must exist in step_plan.",
    })
  })

  it("accepts handoff packages whose current step matches the step plan after trim", () => {
    const result = validateWorkHandoffPackage(handoff({
      current_step: { ...step, step_id: " step-1 " },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects handoff packages whose current step differs from the matching step plan item", () => {
    const result = validateWorkHandoffPackage(handoff({
      step_plan: [step],
      current_step: {
        ...step,
        expected_output: "Different child instruction.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step",
      code: "contract_validation_failed",
      message: "current_step must match the step_plan item with the same step_id.",
    })
  })

  it("rejects handoff packages with duplicate step ids", () => {
    const result = validateWorkHandoffPackage(handoff({
      step_plan: [
        step,
        { ...step, owner_agent_name: "검증자" },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[1].step_id",
      code: "contract_validation_failed",
      message: "step_plan.step_id must be unique.",
    })
  })

  it("rejects handoff packages whose current step owner is not the target agent", () => {
    const reviewerStep: WorkStepPlanItem = {
      ...step,
      owner_agent_name: "검증자",
    }
    const result = validateWorkHandoffPackage(handoff({
      step_plan: [reviewerStep],
      current_step: reviewerStep,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.owner_agent_name",
      code: "contract_validation_failed",
      message: "current_step.owner_agent_name must match target_agent_name.",
    })
  })

  it("rejects handoff packages that delegate to the parent agent", () => {
    const selfStep: WorkStepPlanItem = {
      ...step,
      owner_agent_name: "노비",
    }
    const result = validateWorkHandoffPackage(handoff({
      target_agent_name: "노비",
      step_plan: [selfStep],
      current_step: selfStep,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.target_agent_name",
      code: "contract_validation_failed",
      message: "target_agent_name must differ from parent_agent_name.",
    })
  })

  it("rejects handoff packages whose child work id equals the parent work id", () => {
    const result = validateWorkHandoffPackage(handoff({
      work_id: " work-parent-1 ",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.work_id",
      code: "contract_validation_failed",
      message: "handoff work_id must differ from parent_work_id.",
    })
  })

  it("rejects handoff packages whose parent agent name looks like an internal id", () => {
    const result = validateWorkHandoffPackage(handoff({
      parent_agent_name: "agent:knowbee",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.parent_agent_name",
      code: "contract_validation_failed",
      message: "parent_agent_name must use a user-facing agent name, not an internal ID.",
    })
  })

  it("rejects handoff packages whose target agent name looks like an internal id", () => {
    const targetStep = {
      ...step,
      owner_agent_name: "agent:developer",
    }
    const result = validateWorkHandoffPackage(handoff({
      target_agent_name: "agent:developer",
      step_plan: [targetStep],
      current_step: targetStep,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.target_agent_name",
      code: "contract_validation_failed",
      message: "target_agent_name must use a user-facing agent name, not an internal ID.",
    })
  })

  it("rejects handoff packages without request diagnosis", () => {
    const result = validateWorkHandoffPackage(handoff({ request_diagnosis: undefined as never }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.request_diagnosis" }),
    ]))
  })

  it("rejects handoff packages whose request diagnosis does not recommend delegation", () => {
    const result = validateWorkHandoffPackage(handoff({
      request_diagnosis: {
        ...requestDiagnosis,
        recommended_action: "direct_answer",
        reason: "The parent should answer directly instead of delegating.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.request_diagnosis.recommended_action",
      code: "contract_validation_failed",
      message: "Work handoff request diagnosis must recommend delegate.",
    })
  })

  it("rejects handoff packages with implicit memory visibility", () => {
    const result = validateWorkHandoffPackage(handoff({
      memory_visibility: "share_all" as never,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.memory_visibility",
      code: "contract_validation_failed",
      message: "memory_visibility must be explicit_handoff_only.",
    })
  })

  it("rejects handoff packages with non-child-result return formats", () => {
    const result = validateWorkHandoffPackage(handoff({
      return_format: "plain_text" as never,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.return_format",
      code: "contract_validation_failed",
      message: "return_format must be ChildWorkResult.",
    })
  })

  it("rejects handoff packages with negative retry limits", () => {
    const result = validateWorkHandoffPackage(handoff({
      retry_limit: -1,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retry_limit",
      code: "contract_validation_failed",
      message: "retry_limit must be a non-negative integer.",
    })
  })

  it("rejects handoff packages with fractional retry limits", () => {
    const result = validateWorkHandoffPackage(handoff({
      retry_limit: 1.5,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retry_limit",
      code: "contract_validation_failed",
      message: "retry_limit must be a non-negative integer.",
    })
  })

  it("rejects handoff packages without a deadline or budget declaration", () => {
    const result = validateWorkHandoffPackage(handoff({
      deadline_or_budget: undefined as never,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.deadline_or_budget" }),
    ]))
  })

  it("rejects handoff packages with blank deadline or budget values", () => {
    const result = validateWorkHandoffPackage(handoff({
      deadline_or_budget: "  ",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.deadline_or_budget",
      code: "contract_validation_failed",
      message: "Expected non-empty string at $.deadline_or_budget.",
    })
  })

  it("rejects unsupported raw narrative payload fields", () => {
    const result = validateWorkHandoffPackage({
      ...handoff(),
      raw_transcript: "A long raw conversation transcript must not cross the handoff boundary.",
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.raw_transcript",
      code: "contract_validation_failed",
      message: "Work handoff package contains an unsupported field.",
    })
  })

  it("rejects handoff packages without quality criteria", () => {
    const result = validateWorkHandoffPackage(handoff({
      quality_criteria: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.quality_criteria",
      code: "contract_validation_failed",
      message: "quality_criteria must include at least one non-empty item.",
    })
  })

  it("rejects handoff packages with blank-only quality criteria", () => {
    const result = validateWorkHandoffPackage(handoff({
      quality_criteria: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.quality_criteria",
      code: "contract_validation_failed",
      message: "quality_criteria must include at least one non-empty item.",
    })
  })

  it("rejects handoff packages with blank quality criteria items", () => {
    const result = validateWorkHandoffPackage(handoff({
      quality_criteria: ["Focused diff", "  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.quality_criteria[1]",
      code: "contract_validation_failed",
      message: "quality_criteria items must be non-empty.",
    })
  })

  it("rejects handoff packages with trim-equivalent duplicate quality criteria", () => {
    const result = validateWorkHandoffPackage(handoff({
      quality_criteria: ["Focused diff", " Focused diff "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.quality_criteria[1]",
      code: "contract_validation_failed",
      message: "quality_criteria items must be unique.",
    })
  })

  it("rejects handoff packages with blank context items", () => {
    const result = validateWorkHandoffPackage(handoff({
      context: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.context[0]",
      code: "contract_validation_failed",
      message: "context items must be non-empty.",
    })
  })

  it("rejects handoff packages with trim-equivalent duplicate context items", () => {
    const result = validateWorkHandoffPackage(handoff({
      context: ["Use the current repository state.", " Use the current repository state. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.context[1]",
      code: "contract_validation_failed",
      message: "context items must be unique.",
    })
  })

  it("rejects handoff packages with blank constraint items", () => {
    const result = validateWorkHandoffPackage(handoff({
      constraints: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.constraints[0]",
      code: "contract_validation_failed",
      message: "constraints items must be non-empty.",
    })
  })

  it("rejects handoff packages with trim-equivalent duplicate constraint items", () => {
    const result = validateWorkHandoffPackage(handoff({
      constraints: ["Do not revert user changes.", " Do not revert user changes. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.constraints[1]",
      code: "contract_validation_failed",
      message: "constraints items must be unique.",
    })
  })

  it("rejects handoff packages with blank allowed tool items", () => {
    const result = validateWorkHandoffPackage(handoff({
      allowed_tools: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.allowed_tools[0]",
      code: "contract_validation_failed",
      message: "allowed_tools items must be non-empty.",
    })
  })

  it("rejects handoff packages with normalized duplicate allowed tools", () => {
    const result = validateWorkHandoffPackage(handoff({
      allowed_tools: [" FileSystem ", "filesystem"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.allowed_tools[1]",
      code: "contract_validation_failed",
      message: "allowed_tools items must be unique after trim and lowercase normalization.",
    })
  })

  it("rejects handoff packages with blank disallowed action items", () => {
    const result = validateWorkHandoffPackage(handoff({
      disallowed_actions: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.disallowed_actions[0]",
      code: "contract_validation_failed",
      message: "disallowed_actions items must be non-empty.",
    })
  })

  it("rejects handoff packages with normalized duplicate disallowed actions", () => {
    const result = validateWorkHandoffPackage(handoff({
      disallowed_actions: [" Secret Exposure ", "secret exposure"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.disallowed_actions[1]",
      code: "contract_validation_failed",
      message: "disallowed_actions items must be unique after trim and lowercase normalization.",
    })
  })

  it("rejects handoff packages with tools both allowed and disallowed", () => {
    const result = validateWorkHandoffPackage(handoff({
      allowed_tools: ["filesystem", "vitest"],
      disallowed_actions: ["filesystem"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.disallowed_actions[0]",
      code: "contract_validation_failed",
      message: "disallowed_actions must not repeat allowed_tools items.",
    })
  })

  it("rejects handoff packages with normalized allowed/disallowed conflicts", () => {
    const result = validateWorkHandoffPackage(handoff({
      allowed_tools: [" FileSystem "],
      disallowed_actions: ["filesystem"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.disallowed_actions[0]",
      code: "contract_validation_failed",
      message: "disallowed_actions must not repeat allowed_tools items.",
    })
  })

  it("rejects handoff packages whose recovery policy names no changed dimension", () => {
    const result = validateWorkHandoffPackage(handoff({
      failure_recovery_policy: "Retry differently after failure.",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_recovery_policy",
      code: "contract_validation_failed",
      message: "failure_recovery_policy must name at least one recovery changed dimension.",
    })
  })

  it("rejects handoff packages whose current step is not a delegation step", () => {
    const directStep: WorkStepPlanItem = {
      ...step,
      action_type: "direct_answer",
    }
    const result = validateWorkHandoffPackage(handoff({
      step_plan: [directStep],
      current_step: directStep,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.current_step.action_type",
      code: "contract_validation_failed",
      message: "Work handoff current step action_type must be delegate.",
    })
  })

  it("validates a child work result with result diagnosis and action decision", () => {
    const result = validateChildWorkResult(childResult())

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects child work results without result diagnosis or action decision", () => {
    const result = validateChildWorkResult(childResult({
      result_diagnosis: undefined as never,
      action_decision: undefined as never,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.result_diagnosis" }),
      expect.objectContaining({ path: "$.action_decision" }),
    ]))
  })

  it("rejects child work results whose agent name looks like an internal id", () => {
    const result = validateChildWorkResult(childResult({
      agent_name: "agent:developer",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.agent_name",
      code: "contract_validation_failed",
      message: "agent_name must use a user-facing agent name, not an internal ID.",
    })
  })

  it("rejects child work results with blank action decision next step ids", () => {
    const result = validateChildWorkResult(childResult({
      action_decision: {
        selected_action: "final_report",
        reason: "The child result includes an empty next step.",
        next_step_id: "  ",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.action_decision.next_step_id",
      code: "contract_validation_failed",
      message: "action_decision.next_step_id must be non-empty when present.",
    })
  })

  it("rejects child work results with a step marked both completed and failed", () => {
    const result = validateChildWorkResult(childResult({
      completed_steps: ["step-1"],
      failed_steps: ["step-1"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failed_steps[0]",
      code: "contract_validation_failed",
      message: "Child work result step cannot be both completed and failed.",
    })
  })

  it("rejects completed child work results with failed steps", () => {
    const result = validateChildWorkResult(childResult({
      failed_steps: ["step-2"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failed_steps",
      code: "contract_validation_failed",
      message: "completed child work result must not include failed steps.",
    })
  })

  it("rejects child work results with blank completed step ids", () => {
    const result = validateChildWorkResult(childResult({
      completed_steps: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.completed_steps[0]",
      code: "contract_validation_failed",
      message: "completed_steps items must be non-empty step ids.",
    })
  })

  it("rejects child work results with blank failed step ids", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: [],
      failed_steps: ["  "],
      missing_information: ["test evidence"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "partial",
        missing_information: ["test evidence"],
        recommended_action: "partial_report",
        reason: "The child needs parent review before aggregation.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Parent should review the partial result.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failed_steps[0]",
      code: "contract_validation_failed",
      message: "failed_steps items must be non-empty step ids.",
    })
  })

  it("rejects child work results with duplicate completed step ids", () => {
    const result = validateChildWorkResult(childResult({
      completed_steps: ["step-1", "step-1"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.completed_steps[1]",
      code: "contract_validation_failed",
      message: "completed_steps items must be unique.",
    })
  })

  it("rejects child work results with trim-equivalent duplicate completed step ids", () => {
    const result = validateChildWorkResult(childResult({
      completed_steps: ["step-1", " step-1 "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.completed_steps[1]",
      code: "contract_validation_failed",
      message: "completed_steps items must be unique.",
    })
  })

  it("rejects child work results with duplicate failed step ids", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1", "step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "The failed child result needs recovery.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "test_failure",
        failed_input_refs: ["parent-work"],
        failed_strategy: "run_test",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "retry",
        changed_input_or_strategy: "Retry with a narrower command.",
        expected_benefit: "Reduce ambiguity.",
        risk: "low",
        changed_dimensions: ["strategy"],
      }],
      recommended_next_step: "Retry the failed step with changed strategy.",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failed_steps[1]",
      code: "contract_validation_failed",
      message: "failed_steps items must be unique.",
    })
  })

  it("rejects child work results with trim-equivalent completed and failed step ids", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: ["step-1"],
      failed_steps: [" step-1 "],
      missing_information: ["Parent review is needed for the conflicting step."],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "partial",
        missing_information: ["Parent review is needed for the conflicting step."],
        recommended_action: "partial_report",
        reason: "The child needs parent review before aggregation.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Parent should review the partial result.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failed_steps[0]",
      code: "contract_validation_failed",
      message: "Child work result step cannot be both completed and failed.",
    })
  })

  it("rejects completed child work results without evidence or actions taken", () => {
    const result = validateChildWorkResult(childResult({
      evidence: [],
      actions_taken: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed child work result requires evidence or actions_taken for parent review.",
    })
  })

  it("rejects child work results with blank evidence items", () => {
    const result = validateChildWorkResult(childResult({
      evidence: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.evidence[0]",
      code: "contract_validation_failed",
      message: "evidence items must be non-empty.",
    })
  })

  it("rejects child work results with blank action items", () => {
    const result = validateChildWorkResult(childResult({
      actions_taken: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.actions_taken[0]",
      code: "contract_validation_failed",
      message: "actions_taken items must be non-empty.",
    })
  })

  it("rejects child work results with blank tool items", () => {
    const result = validateChildWorkResult(childResult({
      tools_used: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.tools_used[0]",
      code: "contract_validation_failed",
      message: "tools_used items must be non-empty.",
    })
  })

  it("rejects child work results with blank assumption items", () => {
    const result = validateChildWorkResult(childResult({
      assumptions: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.assumptions[0]",
      code: "contract_validation_failed",
      message: "assumptions items must be non-empty.",
    })
  })

  it("rejects child work results with blank risk items", () => {
    const result = validateChildWorkResult(childResult({
      risks: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.risks[0]",
      code: "contract_validation_failed",
      message: "risks items must be non-empty.",
    })
  })

  it("rejects child work results with blank missing information items", () => {
    const result = validateChildWorkResult(childResult({
      missing_information: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.missing_information[0]",
      code: "contract_validation_failed",
      message: "missing_information items must be non-empty.",
    })
  })

  it("rejects child work results with duplicate evidence items after trim", () => {
    const result = validateChildWorkResult(childResult({
      evidence: ["targeted tests passed", " targeted tests passed "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.evidence[1]",
      code: "contract_validation_failed",
      message: "evidence items must be unique.",
    })
  })

  it("rejects child work results with duplicate action items after trim", () => {
    const result = validateChildWorkResult(childResult({
      actions_taken: ["edited file", " edited file "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.actions_taken[1]",
      code: "contract_validation_failed",
      message: "actions_taken items must be unique.",
    })
  })

  it("rejects child work results with normalized duplicate tool items", () => {
    const result = validateChildWorkResult(childResult({
      tools_used: [" Vitest ", "vitest"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.tools_used[1]",
      code: "contract_validation_failed",
      message: "tools_used items must be unique after trim and lowercase normalization.",
    })
  })

  it("rejects child work results with duplicate assumption items after trim", () => {
    const result = validateChildWorkResult(childResult({
      assumptions: ["The repo state is current.", " The repo state is current. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.assumptions[1]",
      code: "contract_validation_failed",
      message: "assumptions items must be unique.",
    })
  })

  it("rejects child work results with duplicate risk items after trim", () => {
    const result = validateChildWorkResult(childResult({
      risks: ["Manual review is still needed.", " Manual review is still needed. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.risks[1]",
      code: "contract_validation_failed",
      message: "risks items must be unique.",
    })
  })

  it("rejects child work results with duplicate missing information items after trim", () => {
    const result = validateChildWorkResult(childResult({
      missing_information: ["Target environment is unknown.", " Target environment is unknown. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.missing_information[1]",
      code: "contract_validation_failed",
      message: "missing_information items must be unique.",
    })
  })

  it("rejects completed child work results when parent review is disabled", () => {
    const result = validateChildWorkResult(childResult({
      needs_parent_review: false,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.needs_parent_review",
      code: "contract_validation_failed",
      message: "completed child work result requires needs_parent_review = true.",
    })
  })

  it("rejects child work results whose action decision does not match result diagnosis", () => {
    const result = validateChildWorkResult(childResult({
      action_decision: {
        selected_action: "retry",
        reason: "This contradicts the final report diagnosis.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.action_decision.selected_action",
      code: "contract_validation_failed",
      message: "Child work result action decision must match result_diagnosis.recommended_action.",
    })
  })

  it("rejects completed child work results whose diagnosis still recommends retry", () => {
    const result = validateChildWorkResult(childResult({
      result_diagnosis: {
        ...resultDiagnosis,
        recommended_action: "retry",
        reason: "The parent should retry before aggregation.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry is still required.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed child work result requires sufficient final_report diagnosis and action decision.",
    })
  })

  it("rejects partial child work results whose diagnosis is final report", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: [],
      failed_steps: ["step-1"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "partial child work result requires partial diagnosis and a non-final next action.",
    })
  })

  it("rejects partial child work results without failed steps or missing information", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: ["step-1"],
      failed_steps: [],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "The child completed part of the work.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Parent should review the partial result.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "partial child work result requires failed_steps or missing_information for parent review.",
    })
  })

  it("rejects partial child work results when parent review is disabled", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: ["step-1"],
      failed_steps: ["step-2"],
      missing_information: ["test evidence"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "partial",
        missing_information: ["test evidence"],
        recommended_action: "partial_report",
        reason: "The child needs parent review before aggregation.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Parent should review the partial result.",
      },
      needs_parent_review: false,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.needs_parent_review",
      code: "contract_validation_failed",
      message: "partial child work result requires needs_parent_review = true.",
    })
  })

  it("validates partial child work results with parent review context", () => {
    const result = validateChildWorkResult(childResult({
      status: "partial",
      completed_steps: ["step-1"],
      failed_steps: ["step-2"],
      missing_information: ["test evidence"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "partial",
        missing_information: ["test evidence"],
        recommended_action: "partial_report",
        reason: "The child completed part of the work and needs review.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Parent should review the partial result.",
      },
      needs_parent_review: true,
      recommended_next_step: "Parent should request the missing test evidence.",
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects failed child work results whose diagnosis is final report", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "failed child work result requires non-sufficient diagnosis and non-final action decision.",
    })
  })

  it("rejects failed child work results without failed steps or failure diagnosis", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: [],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "stop_blocked",
        reason: "The child could not complete the task.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Parent should review the failed child task.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      {
        path: "$.failed_steps",
        code: "contract_validation_failed",
        message: "failed child work result requires at least one failed step.",
      },
      {
        path: "$.failure_diagnosis",
        code: "contract_validation_failed",
        message: "failed child work result requires failure_diagnosis.",
      },
    ]))
  })

  it("rejects recoverable failed child work results without recovery attempts", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_attempts",
      code: "contract_validation_failed",
      message: "recoverable failed child work result requires at least one recovery attempt.",
    })
  })

  it("validates failed child work results with failure diagnosis and recovery attempts", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects child recovery attempts with blank required permissions", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the permission.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "permission_missing",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b after permission is granted.",
        expected_benefit: "The alternate tool can run with permission.",
        risk: "low",
        required_permission: "  ",
        changed_dimensions: ["permission"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_attempts[0].required_permission",
      code: "contract_validation_failed",
      message: "required_permission must be non-empty when present.",
    })
  })

  it("rejects child recovery attempts with undefined metadata values", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
        metadata: {
          candidate_id: undefined as never,
        },
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_attempts[0].metadata.candidate_id",
      code: "contract_validation_failed",
      message: "metadata values must be JSON values without undefined.",
    })
  })

  it("rejects child failure diagnosis with blank failed input refs", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["  "],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_input_refs[0]",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_input_refs items must be non-empty.",
    })
  })

  it("rejects child failure diagnosis with duplicate failed input refs after trim", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["tool:a", " tool:a "],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_input_refs[1]",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_input_refs items must be unique.",
    })
  })

  it("rejects failed child work results when parent review is disabled", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
      needs_parent_review: false,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.needs_parent_review",
      code: "contract_validation_failed",
      message: "failed child work result requires needs_parent_review = true.",
    })
  })

  it("rejects blocked child work results whose diagnosis is final report", () => {
    const result = validateChildWorkResult(childResult({
      status: "blocked",
      completed_steps: [],
      failed_steps: ["step-1"],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "blocked child work result requires non-sufficient diagnosis and blocked or clarification action.",
    })
  })

  it("rejects blocked child work results without blocker context", () => {
    const result = validateChildWorkResult(childResult({
      status: "blocked",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "unknown",
        recommended_action: "stop_blocked",
        reason: "The child is blocked.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Parent should review the blocked child task.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "blocked child work result requires missing_information or risks for parent review.",
    })
  })

  it("rejects blocked child work results when parent review is disabled", () => {
    const result = validateChildWorkResult(childResult({
      status: "blocked",
      completed_steps: [],
      failed_steps: ["step-1"],
      missing_information: ["screen-control permission"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "unknown",
        missing_information: ["screen-control permission"],
        recommended_action: "stop_blocked",
        reason: "The child cannot continue without permission.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Parent should report the missing permission.",
      },
      needs_parent_review: false,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.needs_parent_review",
      code: "contract_validation_failed",
      message: "blocked child work result requires needs_parent_review = true.",
    })
  })

  it("validates blocked child work results with blocked diagnosis and action", () => {
    const result = validateChildWorkResult(childResult({
      status: "blocked",
      completed_steps: [],
      failed_steps: ["step-1"],
      missing_information: ["screen-control permission"],
      risks: ["Permission is required before continuing."],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "unknown",
        missing_information: ["screen-control permission"],
        risks: ["Permission is required before continuing."],
        recommended_action: "stop_blocked",
        reason: "The child cannot continue without permission.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Parent should report the missing permission.",
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects child recovery attempts that repeat the failed strategy", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "use_tool:a",
        expected_benefit: "Try the same unavailable tool again.",
        risk: "low",
        changed_dimensions: [],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_attempts[0].changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })

  it("rejects child failure diagnosis that is not linked to a failed step", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "missing-step",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_step_id",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_step_id must exist in failed_steps.",
    })
  })

  it("accepts child failure diagnosis that matches a failed step after trim", () => {
    const result = validateChildWorkResult(childResult({
      status: "failed",
      completed_steps: [],
      failed_steps: ["step-1"],
      result_diagnosis: {
        ...resultDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is needed.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry only after changing the strategy.",
      },
      failure_diagnosis: {
        failed_step_id: " step-1 ",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_attempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
      recommended_next_step: "Retry the failed step with changed strategy.",
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })
})
