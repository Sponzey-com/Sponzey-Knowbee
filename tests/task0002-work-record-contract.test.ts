import { describe, expect, it } from "vitest"
import {
  canTransitionWorkRecordStatus,
  validateRecoveryCandidateAgainstFailure,
  validateWorkRecord,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

const COMPLETION_CRITERIA_MESSAGE = "partial to completed requires completed required steps, sufficient result diagnosis, final_report diagnosis, and final_report action decision."
const RUNNING_COMPLETION_CRITERIA_MESSAGE = "running to completed requires completed required steps, sufficient result diagnosis, final_report diagnosis, and final_report action decision."
const PARTIAL_CRITERIA_MESSAGE = "running to partial requires verified achieved work, an unmet failed step, partial sufficiency, a valid recovery candidate, and a matching structured next action."
const RECOVERY_ACTION_INVALID_MESSAGE = "failed to planned requires a valid recoverable failure diagnosis, a selected recovery action from recovery_candidates, and a recovery action that changes the failed input, strategy, tool, delegation target, permission, scope, or validation method."
const PARTIAL_RECOVERY_ACTION_INVALID_MESSAGE = "partial to planned requires a valid recoverable failure diagnosis, a selected recovery action from recovery_candidates, and a recovery action that changes the failed input, strategy, tool, delegation target, permission, scope, or validation method."

function validWorkRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "노비",
    source: "user",
    status: "running",
    user_request_summary: "Create a short plan.",
    request_diagnosis: {
      diagnosis_summary: "The user asked for a plan.",
      intent: "plan_request",
      goal: "Create a short plan.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "Planning is directly requested.",
    },
    step_plan: [
      {
        step_id: "step-1",
        owner_agent_name: "노비",
        action_type: "plan",
        input_refs: ["user-request"],
        expected_output: "A concise plan.",
        completion_criteria: "The plan has ordered steps.",
        status: "completed",
      },
    ],
    step_results: [
      {
        step_id: "step-1",
        status: "completed",
        output_ref: "result-1",
        evidence_refs: ["plan-draft"],
        completed_at: 1,
      },
    ],
    result_diagnosis: {
      diagnosis_summary: "The plan satisfies the request.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The result meets the completion criteria.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "All required steps are complete.",
    },
    ...overrides,
  }
}

describe("task0002 work record contract", () => {
  it("validates a structured work record with LLM diagnosis and action decision", () => {
    const result = validateWorkRecord(validWorkRecord())

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects missing action decisions and invalid recommended actions", () => {
    const invalid = validWorkRecord({
      request_diagnosis: {
        ...validWorkRecord().request_diagnosis,
        recommended_action: "keyword_route" as never,
      },
      action_decision: undefined as never,
    })

    const result = validateWorkRecord(invalid)

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.request_diagnosis.recommended_action" }),
      expect.objectContaining({ path: "$.action_decision" }),
    ]))
  })

  it("rejects work records whose owner agent name looks like an internal id", () => {
    const result = validateWorkRecord(validWorkRecord({
      owner_agent_name: "agent:knowbee",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.owner_agent_name",
      code: "contract_validation_failed",
      message: "owner_agent_name must use a user-facing agent name, not an internal ID.",
    })
  })

  it("rejects work records whose step owner agent name looks like an internal id", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...base.step_plan[0],
        owner_agent_name: "agent:worker",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[0].owner_agent_name",
      code: "contract_validation_failed",
      message: "step_plan.owner_agent_name must use a user-facing agent name, not an internal ID.",
    })
  })

  it("rejects work records with duplicate step ids", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [
        base.step_plan[0],
        {
          ...base.step_plan[0],
          owner_agent_name: "검증자",
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[1].step_id",
      code: "contract_validation_failed",
      message: "step_plan.step_id must be unique.",
    })
  })

  it("rejects work records with trim-equivalent duplicate step ids", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [
        base.step_plan[0],
        {
          ...base.step_plan[0],
          step_id: " step-1 ",
          owner_agent_name: "검증자",
        },
      ],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[1].step_id",
      code: "contract_validation_failed",
      message: "step_plan.step_id must be unique.",
    })
  })

  it("accepts work records whose step result matches the step plan after trim", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...base.step_results[0],
        step_id: " step-1 ",
      }],
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects work records with blank step input refs", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...base.step_plan[0],
        input_refs: ["  "],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[0].input_refs[0]",
      code: "contract_validation_failed",
      message: "step_plan.input_refs items must be non-empty.",
    })
  })

  it("rejects work records with duplicate step input refs after trim", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...base.step_plan[0],
        input_refs: ["user-request", " user-request "],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_plan[0].input_refs[1]",
      code: "contract_validation_failed",
      message: "step_plan.input_refs items must be unique.",
    })
  })

  it("rejects work records with blank step evidence refs", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...base.step_results[0],
        evidence_refs: ["  "],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].evidence_refs[0]",
      code: "contract_validation_failed",
      message: "step_results.evidence_refs items must be non-empty.",
    })
  })

  it("rejects work records with duplicate step evidence refs after trim", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...base.step_results[0],
        evidence_refs: ["plan-draft", " plan-draft "],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].evidence_refs[1]",
      code: "contract_validation_failed",
      message: "step_results.evidence_refs items must be unique.",
    })
  })

  it("rejects blank step result errors when present", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...base.step_results[0],
        error: "  ",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].error",
      code: "contract_validation_failed",
      message: "step_results.error must be non-empty when present.",
    })
  })

  it("rejects work records with blank parent work ids", () => {
    const result = validateWorkRecord(validWorkRecord({
      parent_work_id: "  ",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.parent_work_id",
      code: "contract_validation_failed",
      message: "parent_work_id must be non-empty when present.",
    })
  })

  it("rejects parent-agent work records without parent work ids", () => {
    const result = validateWorkRecord(validWorkRecord({
      source: "parent_agent",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.parent_work_id",
      code: "contract_validation_failed",
      message: "parent_agent work records require parent_work_id.",
    })
  })

  it("rejects work records whose parent work id equals their work id", () => {
    const result = validateWorkRecord(validWorkRecord({
      parent_work_id: " work-1 ",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.parent_work_id",
      code: "contract_validation_failed",
      message: "parent_work_id must differ from work_id.",
    })
  })

  it("rejects work records with blank step output refs", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...base.step_results[0],
        output_ref: "  ",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].output_ref",
      code: "contract_validation_failed",
      message: "step_results.output_ref must be non-empty when present.",
    })
  })

  it("rejects work records with blank stop conditions when present", () => {
    const result = validateWorkRecord(validWorkRecord({
      stop_condition: "  ",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.stop_condition",
      code: "contract_validation_failed",
      message: "stop_condition must be non-empty when present.",
    })
  })

  it("rejects work records with step results that are not in the step plan", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        step_id: "missing-step",
        status: "completed",
        output_ref: "result-1",
        evidence_refs: ["plan-draft"],
        completed_at: 1,
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].step_id",
      code: "contract_validation_failed",
      message: "step_results.step_id must exist in step_plan.",
    })
  })

  it("rejects work records whose action decision points to a missing next step", () => {
    const result = validateWorkRecord(validWorkRecord({
      action_decision: {
        selected_action: "final_report",
        reason: "The decision points to a missing step.",
        next_step_id: "missing-step",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.action_decision.next_step_id",
      code: "contract_validation_failed",
      message: "action_decision.next_step_id must exist in step_plan.",
    })
  })

  it("rejects work records with blank action decision next step ids", () => {
    const result = validateWorkRecord(validWorkRecord({
      action_decision: {
        selected_action: "final_report",
        reason: "The decision includes an empty next step.",
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

  it("rejects work records with negative retry counts", () => {
    const result = validateWorkRecord(validWorkRecord({
      retry_count: -1,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retry_count",
      code: "contract_validation_failed",
      message: "retry_count must be a non-negative integer.",
    })
  })

  it("rejects work records with fractional retry counts", () => {
    const result = validateWorkRecord(validWorkRecord({
      retry_count: 1.5,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retry_count",
      code: "contract_validation_failed",
      message: "retry_count must be a non-negative integer.",
    })
  })

  it("rejects work records with negative retry limits", () => {
    const result = validateWorkRecord(validWorkRecord({
      retry_limit: -1,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.retry_limit",
      code: "contract_validation_failed",
      message: "retry_limit must be a non-negative integer.",
    })
  })

  it("allows work records whose action decision points to a planned next step", () => {
    const result = validateWorkRecord(validWorkRecord({
      action_decision: {
        selected_action: "final_report",
        reason: "The decision points to the completed step for reporting.",
        next_step_id: "step-1",
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects work records whose failed planned step has a completed result", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        ...validWorkRecord().step_results[0],
        status: "completed",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].status",
      code: "contract_validation_failed",
      message: "step_results.status must match terminal step_plan.status for completed, failed, and blocked results.",
    })
  })

  it("rejects work records whose completed planned step has a failed result", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_results: [{
        ...validWorkRecord().step_results[0],
        status: "failed",
        error: "The result contradicts the completed plan state.",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].status",
      code: "contract_validation_failed",
      message: "step_results.status must match terminal step_plan.status for completed, failed, and blocked results.",
    })
  })

  it("allows running planned steps to have partial results", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "running",
      }],
      step_results: [{
        ...validWorkRecord().step_results[0],
        status: "partial",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "The result is still partial.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report partial progress.",
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects failed step results without an error reason", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].error",
      code: "contract_validation_failed",
      message: "failed or blocked step result requires a non-empty error reason.",
    })
  })

  it("rejects blocked step results without an error reason", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "blocked",
      }],
      step_results: [{
        step_id: "step-1",
        status: "blocked",
        evidence_refs: ["permission-check"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.step_results[0].error",
      code: "contract_validation_failed",
      message: "failed or blocked step result requires a non-empty error reason.",
    })
  })

  it("allows failed step results with an error reason", () => {
    const result = validateWorkRecord(validWorkRecord({
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "stop_blocked",
        reason: "The step failed and cannot continue.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Report the failed tool.",
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects failed work records without a recovery bundle", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      {
        path: "$.failure_diagnosis",
        code: "contract_validation_failed",
        message: "failed work record requires failure_diagnosis.",
      },
      {
        path: "$.recovery_candidates",
        code: "contract_validation_failed",
        message: "failed work record requires at least one recovery candidate.",
      },
      {
        path: "$.selected_recovery_action",
        code: "contract_validation_failed",
        message: "failed work record requires selected_recovery_action.",
      },
      {
        path: "$.stop_condition",
        code: "contract_validation_failed",
        message: "failed work record requires a non-empty stop_condition.",
      },
    ]))
  })

  it("rejects failed work records without a stop condition", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.stop_condition",
      code: "contract_validation_failed",
      message: "failed work record requires a non-empty stop_condition.",
    })
  })

  it("allows failed work records with a full recovery bundle", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      stop_condition: "retry_with_changed_tool",
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects work recovery candidates with blank required permissions", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      required_permission: "  ",
      changed_dimensions: ["permission" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "permission_missing",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed permission.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "permission_missing",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      stop_condition: "retry_with_permission",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_candidates[0].required_permission",
      code: "contract_validation_failed",
      message: "required_permission must be non-empty when present.",
    })
  })

  it("rejects recovery candidates with empty changed dimensions", () => {
    const result = validateWorkRecord(validWorkRecord({
      recovery_candidates: [{
        action_type: "retry",
        changed_input_or_strategy: "Retry with a narrower input.",
        expected_benefit: "The alternate input removes ambiguity.",
        risk: "low",
        changed_dimensions: [],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_candidates[0].changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })

  it("rejects recovery candidates with duplicate changed dimensions", () => {
    const result = validateWorkRecord(validWorkRecord({
      recovery_candidates: [{
        action_type: "retry",
        changed_input_or_strategy: "Retry with a narrower input.",
        expected_benefit: "The alternate input removes ambiguity.",
        risk: "low",
        changed_dimensions: ["input", "input"],
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_candidates[0].changed_dimensions[1]",
      code: "contract_validation_failed",
      message: "changed_dimensions items must be unique.",
    })
  })

  it("rejects selected recovery actions with empty changed dimensions", () => {
    const result = validateWorkRecord(validWorkRecord({
      selected_recovery_action: {
        action_type: "retry",
        changed_input_or_strategy: "Retry with a narrower input.",
        expected_benefit: "The alternate input removes ambiguity.",
        risk: "low",
        changed_dimensions: [],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.selected_recovery_action.changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })

  it("rejects selected recovery actions with duplicate changed dimensions", () => {
    const result = validateWorkRecord(validWorkRecord({
      selected_recovery_action: {
        action_type: "retry",
        changed_input_or_strategy: "Retry with a narrower input.",
        expected_benefit: "The alternate input removes ambiguity.",
        risk: "low",
        changed_dimensions: ["input", "input"],
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.selected_recovery_action.changed_dimensions[1]",
      code: "contract_validation_failed",
      message: "changed_dimensions items must be unique.",
    })
  })

  it("rejects duplicate recovery candidates", () => {
    const candidate = {
      action_type: "retry" as const,
      changed_input_or_strategy: "Retry with a narrower input.",
      expected_benefit: "The alternate input removes ambiguity.",
      risk: "low",
      changed_dimensions: ["input" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      recovery_candidates: [candidate, { ...candidate }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_candidates[1]",
      code: "contract_validation_failed",
      message: "recovery_candidates items must be unique.",
    })
  })

  it("rejects work failure diagnosis with blank failed input refs", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["  "],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      stop_condition: "retry_with_changed_tool",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_input_refs[0]",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_input_refs items must be non-empty.",
    })
  })

  it("rejects work failure diagnosis with duplicate failed input refs after trim", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with changed input.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["tool:a", " tool:a "],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      stop_condition: "retry_with_changed_tool",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_input_refs[1]",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_input_refs items must be unique.",
    })
  })

  it("rejects completed work records whose result diagnosis still recommends retry", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "completed",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The work still needs a retry.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry conflicts with completed status.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed work record requires sufficient final_report diagnosis and action decision.",
    })
  })

  it("rejects completed work records with unfinished required step plans", () => {
    const base = validWorkRecord()
    const result = validateWorkRecord(validWorkRecord({
      status: "completed",
      step_plan: [{
        ...base.step_plan[0],
        status: "running",
      }],
      step_results: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed work record requires completed required steps and completed step results.",
    })
  })

  it("rejects completed work records missing completed step results for required steps", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "completed",
      step_results: [],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed work record requires completed required steps and completed step results.",
    })
  })

  it("rejects failed work records whose result diagnosis is final report", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      stop_condition: "retry_with_changed_tool",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "failed work record requires non-sufficient diagnosis and non-final action decision.",
    })
  })

  it("rejects blocked work records whose result diagnosis is final report", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "blocked",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "blocked",
      }],
      step_results: [{
        step_id: "step-1",
        status: "blocked",
        evidence_refs: ["permission-check"],
        error: "permission_missing",
      }],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "blocked work record requires non-sufficient diagnosis and blocked or clarification action.",
    })
  })

  it("validates blocked work records with blocked diagnosis and action", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "blocked",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "blocked",
      }],
      step_results: [{
        step_id: "step-1",
        status: "blocked",
        evidence_refs: ["permission-check"],
        error: "permission_missing",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "unknown",
        missing_information: ["screen-control permission"],
        risks: ["Permission is required before continuing."],
        recommended_action: "stop_blocked",
        reason: "The work cannot continue without permission.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Report the missing permission.",
      },
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects partial work records whose result diagnosis is final report", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "partial work record requires partial diagnosis, a matching non-final action decision, failure_diagnosis, and at least one recovery candidate.",
    })
  })

  it("rejects partial work records without failure and recovery context", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "Report partial progress with recovery context.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report achieved work and continue recovery.",
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "partial work record requires partial diagnosis, a matching non-final action decision, failure_diagnosis, and at least one recovery candidate.",
    })
  })

  it("validates partial work records with failure diagnosis and recovery candidates", () => {
    const recovery = {
      action_type: "ask_clarification" as const,
      changed_input_or_strategy: "Ask the user for the missing permission.",
      expected_benefit: "The user can unblock the remaining step.",
      risk: "low",
      changed_dimensions: ["permission" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
      step_plan: [
        validWorkRecord().step_plan[0],
        {
          ...validWorkRecord().step_plan[0],
          step_id: "step-2",
          status: "running",
        },
      ],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        missing_information: ["screen-control permission"],
        recommended_action: "partial_report",
        reason: "Completed one step and needs permission for the remaining step.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report achieved work and continue recovery.",
      },
      failure_diagnosis: {
        failed_step_id: "step-2",
        failure_reason: "permission_missing",
        failed_input_refs: ["screen-control"],
        failed_strategy: "use_yeonjang:screen",
        recoverable: true,
      },
      recovery_candidates: [recovery],
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects partial retry work records without a selected recovery action", () => {
    const recovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "Retry with a narrower input.",
      expected_benefit: "The alternate input removes ambiguity.",
      risk: "low",
      changed_dimensions: ["input" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: undefined,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.selected_recovery_action",
      code: "contract_validation_failed",
      message: "partial retry or redelegate work record requires selected_recovery_action.",
    })
  })

  it("validates partial retry work records with a selected recovery action", () => {
    const recovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "Retry with a narrower input.",
      expected_benefit: "The alternate input removes ambiguity.",
      risk: "low",
      changed_dimensions: ["input" as const],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
    }))

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects work records whose failure diagnosis points to a missing planned step", () => {
    const result = validateWorkRecord(validWorkRecord({
      failure_diagnosis: {
        failed_step_id: "missing-step",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_step_id",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_step_id must exist in step_plan.",
    })
  })

  it("rejects work records whose failure diagnosis points to a completed planned step", () => {
    const result = validateWorkRecord(validWorkRecord({
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.failure_diagnosis.failed_step_id",
      code: "contract_validation_failed",
      message: "failure_diagnosis.failed_step_id must not reference a completed or skipped step.",
    })
  })

  it("allows only GOAL-defined work record status transitions", () => {
    const running = validWorkRecord({ status: "running" })

    expect(canTransitionWorkRecordStatus(running, "completed")).toEqual({ ok: true })
    expect(canTransitionWorkRecordStatus(running, "intake")).toEqual({
      ok: false,
      reasonCode: "transition_not_allowed",
      message: "Work record status cannot transition from running to intake.",
    })
  })

  it("requires a selected recovery action before failed work can return to planned", () => {
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [],
      selected_recovery_action: undefined,
    })

    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_required",
      message: "failed to planned requires recovery candidates and a selected recovery action.",
    })

    expect(canTransitionWorkRecordStatus({
      ...failed,
      recovery_candidates: [{
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      }],
      selected_recovery_action: {
        action_type: "use_tool",
        changed_input_or_strategy: "Use tool b instead of tool a.",
        expected_benefit: "The alternate tool is available.",
        risk: "low",
        changed_dimensions: ["tool"],
      },
    }, "planned")).toEqual({ ok: true })
  })

  it("rejects failed to planned transitions when the selected recovery action repeats the failed strategy", () => {
    const repeatedRecovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "use_tool:a",
      expected_benefit: "Try the same tool call again.",
      risk: "low",
      changed_dimensions: [],
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [repeatedRecovery],
      selected_recovery_action: repeatedRecovery,
    })

    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("rejects failed to planned transitions when failure diagnosis points to a completed step", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const failed = validWorkRecord({
      status: "failed",
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
    })

    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("rejects failed to planned transitions when failure diagnosis is not recoverable", () => {
    const recovery = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: false,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
    })

    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("requires a selected recovery action before partial work can return to planned", () => {
    const recovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "Retry with a narrower input.",
      expected_benefit: "The alternate input removes ambiguity.",
      risk: "low",
      changed_dimensions: ["input" as const],
    }
    const partial = validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: undefined,
      retry_count: 0,
      retry_limit: 2,
    })

    expect(validateWorkRecord(partial).ok).toBe(false)
    expect(canTransitionWorkRecordStatus(partial, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_required",
      message: "partial to planned requires recovery candidates and a selected recovery action.",
    })

    expect(canTransitionWorkRecordStatus({
      ...partial,
      selected_recovery_action: recovery,
    }, "planned")).toEqual({ ok: true })
  })

  it("allows partial work with a changed recovery candidate to return to planned regardless of retry count", () => {
    const recovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "Retry with a narrower input.",
      expected_benefit: "The alternate input removes ambiguity.",
      risk: "low",
      changed_dimensions: ["input" as const],
    }
    const partial = validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      retry_count: 2,
      retry_limit: 2,
    })

    expect(validateWorkRecord(partial).ok).toBe(true)
    expect(canTransitionWorkRecordStatus(partial, "planned")).toEqual({ ok: true })
  })

  it("rejects partial to planned transitions when the selected recovery action repeats the failed strategy", () => {
    const repeatedRecovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "draft_from_original_input",
      expected_benefit: "Try the same input again.",
      risk: "low",
      changed_dimensions: [],
    }
    const partial = validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [repeatedRecovery],
      selected_recovery_action: repeatedRecovery,
      retry_count: 0,
      retry_limit: 2,
    })

    expect(canTransitionWorkRecordStatus(partial, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: PARTIAL_RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("rejects selected recovery actions that are not listed in recovery candidates", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
    }
    const selected = {
      ...candidate,
      changed_input_or_strategy: "Ask the user for permission instead.",
      changed_dimensions: ["permission" as const],
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_reordered_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.selected_recovery_action",
      code: "contract_validation_failed",
      message: "selected_recovery_action must match one recovery_candidates item.",
    })
    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("rejects failed work records whose selected recovery action repeats the failed strategy", () => {
    const repeatedRecovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "use_tool:a",
      expected_benefit: "Try the same strategy again.",
      risk: "low",
      changed_dimensions: [],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [repeatedRecovery],
      selected_recovery_action: repeatedRecovery,
      stop_condition: "retry_with_changed_strategy",
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.selected_recovery_action.changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })

  it("rejects partial retry work records whose selected recovery action repeats the failed strategy", () => {
    const repeatedRecovery = {
      action_type: "retry" as const,
      changed_input_or_strategy: "draft_from_original_input",
      expected_benefit: "Try the same input again.",
      risk: "low",
      changed_dimensions: [],
    }
    const result = validateWorkRecord(validWorkRecord({
      status: "partial",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["partial-result"],
        error: "input_ambiguous",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "The next attempt needs changed input.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "input_ambiguous",
        failed_input_refs: ["same-input"],
        failed_strategy: "draft_from_original_input",
        recoverable: true,
      },
      recovery_candidates: [repeatedRecovery],
      selected_recovery_action: repeatedRecovery,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.selected_recovery_action.changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })

  it("rejects selected recovery actions whose metadata does not match the recovery candidate", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        candidate_id: "candidate:a",
        evidence_refs: ["trace:1", "trace:2"],
      },
    }
    const selected = {
      ...candidate,
      metadata: {
        candidate_id: "candidate:b",
        evidence_refs: ["trace:1", "trace:2"],
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_changed_tool",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.selected_recovery_action",
      code: "contract_validation_failed",
      message: "selected_recovery_action must match one recovery_candidates item.",
    })
    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({
      ok: false,
      reasonCode: "recovery_action_invalid",
      message: RECOVERY_ACTION_INVALID_MESSAGE,
    })
  })

  it("rejects recovery candidates with undefined metadata values", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        candidate_id: undefined as never,
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: candidate,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.recovery_candidates[0].metadata.candidate_id",
      code: "contract_validation_failed",
      message: "metadata values must be JSON values without undefined.",
    })
  })

  it("rejects recovery candidates with blank metadata keys", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        "  ": "candidate:a",
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: candidate,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.recovery_candidates[0].metadata",
      code: "contract_validation_failed",
      message: "metadata keys must be non-empty when present.",
    })
  })

  it("rejects recovery candidates with blank nested metadata keys", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        evidence: {
          " ": "trace:1",
        },
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: candidate,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.recovery_candidates[0].metadata.evidence",
      code: "contract_validation_failed",
      message: "metadata keys must be non-empty when present.",
    })
  })

  it("rejects selected recovery actions with undefined metadata values", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        candidate_id: "candidate:a",
      },
    }
    const selected = {
      ...candidate,
      metadata: {
        candidate_id: undefined as never,
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.selected_recovery_action.metadata.candidate_id",
      code: "contract_validation_failed",
      message: "metadata values must be JSON values without undefined.",
    })
  })

  it("rejects selected recovery actions with blank metadata keys", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        candidate_id: "candidate:a",
      },
    }
    const selected = {
      ...candidate,
      metadata: {
        "": "candidate:a",
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.selected_recovery_action.metadata",
      code: "contract_validation_failed",
      message: "metadata keys must be non-empty when present.",
    })
  })

  it("rejects selected recovery actions with blank nested metadata keys", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        evidence: {
          trace: "trace:1",
        },
      },
    }
    const selected = {
      ...candidate,
      metadata: {
        evidence: {
          "": "trace:1",
        },
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.selected_recovery_action.metadata.evidence",
      code: "contract_validation_failed",
      message: "metadata keys must be non-empty when present.",
    })
  })

  it("rejects recovery candidates whose metadata is not an object", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: ["trace:1"] as never,
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: candidate,
      stop_condition: "retry_with_metadata",
    })

    const validation = validateWorkRecord(failed)

    expect(validation.ok).toBe(false)
    expect(validation.issues).toContainEqual({
      path: "$.recovery_candidates[0].metadata",
      code: "contract_validation_failed",
      message: "metadata must be a JSON object when present.",
    })
  })

  it("allows selected recovery actions with matching metadata regardless of metadata key order", () => {
    const candidate = {
      action_type: "use_tool" as const,
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool" as const],
      metadata: {
        candidate_id: "candidate:a",
        evidence: { second: "trace:2", first: "trace:1" },
      },
    }
    const selected = {
      ...candidate,
      metadata: {
        evidence: { first: "trace:1", second: "trace:2" },
        candidate_id: "candidate:a",
      },
    }
    const failed = validWorkRecord({
      status: "failed",
      step_plan: [{
        ...validWorkRecord().step_plan[0],
        status: "failed",
      }],
      step_results: [{
        step_id: "step-1",
        status: "failed",
        evidence_refs: ["tool-call"],
        error: "tool_unavailable",
      }],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "insufficient",
        recommended_action: "retry",
        reason: "A changed retry is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "Retry with the selected recovery action.",
      },
      retry_count: 0,
      retry_limit: 2,
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [candidate],
      selected_recovery_action: selected,
      stop_condition: "retry_with_reordered_metadata",
    })

    expect(validateWorkRecord(failed).ok).toBe(true)
    expect(canTransitionWorkRecordStatus(failed, "planned")).toEqual({ ok: true })
  })

  it("requires completion criteria before partial work can become completed", () => {
    const partial = validWorkRecord({
      status: "partial",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
      },
    })

    expect(canTransitionWorkRecordStatus(partial, "completed")).toEqual({
      ok: false,
      reasonCode: "completion_criteria_not_met",
      message: COMPLETION_CRITERIA_MESSAGE,
    })
    expect(canTransitionWorkRecordStatus(validWorkRecord({ status: "partial" }), "completed")).toEqual({ ok: true })
  })

  it("requires final report action before running work can become completed", () => {
    const running = validWorkRecord({
      status: "running",
      action_decision: {
        selected_action: "retry",
        reason: "Retry conflicts with completed status.",
      },
    })

    expect(canTransitionWorkRecordStatus(running, "completed")).toEqual({
      ok: false,
      reasonCode: "completion_criteria_not_met",
      message: RUNNING_COMPLETION_CRITERIA_MESSAGE,
    })
  })

  it("requires completed step plan status before running work can become completed", () => {
    const base = validWorkRecord()
    const running = validWorkRecord({
      status: "running",
      step_plan: [{
        ...base.step_plan[0],
        status: "running",
      }],
    })

    expect(canTransitionWorkRecordStatus(running, "completed")).toEqual({
      ok: false,
      reasonCode: "completion_criteria_not_met",
      message: RUNNING_COMPLETION_CRITERIA_MESSAGE,
    })
  })

  it("requires completed step plan status before partial work can become completed", () => {
    const base = validWorkRecord()
    const partial = validWorkRecord({
      status: "partial",
      step_plan: [{
        ...base.step_plan[0],
        status: "pending",
      }],
    })

    expect(canTransitionWorkRecordStatus(partial, "completed")).toEqual({
      ok: false,
      reasonCode: "completion_criteria_not_met",
      message: COMPLETION_CRITERIA_MESSAGE,
    })
  })

  it("excludes skipped steps from completed transition requirements", () => {
    const base = validWorkRecord()
    const running = validWorkRecord({
      status: "running",
      step_plan: [
        base.step_plan[0],
        {
          step_id: "step-2",
          owner_agent_name: "노비",
          action_type: "delegate",
          input_refs: ["optional-input"],
          expected_output: "Optional delegated result.",
          completion_criteria: "Optional work can be skipped.",
          status: "skipped",
        },
      ],
      step_results: [base.step_results[0]],
    })

    expect(canTransitionWorkRecordStatus(running, "completed")).toEqual({ ok: true })
  })

  it("requires final report result diagnosis before partial work can become completed", () => {
    const partial = validWorkRecord({
      status: "partial",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        recommended_action: "retry",
        reason: "The result should still retry.",
      },
    })

    expect(canTransitionWorkRecordStatus(partial, "completed")).toEqual({
      ok: false,
      reasonCode: "completion_criteria_not_met",
      message: COMPLETION_CRITERIA_MESSAGE,
    })
  })

  it("requires blocker resolution evidence before blocked work can return to planned", () => {
    const blocked = validWorkRecord({
      status: "blocked",
      unblock_evidence: [],
    })

    expect(canTransitionWorkRecordStatus(blocked, "planned")).toEqual({
      ok: false,
      reasonCode: "blocker_resolution_required",
      message: "blocked to planned requires structured unblock evidence.",
    })
    expect(canTransitionWorkRecordStatus({
      ...blocked,
      active_blocker: {
        blocker_kind: "permission",
        blocker_ref: "permission:repository-read",
        evidence_refs: ["evidence:permission-denied"],
      },
      blocker_resolution: {
        receipt_id: "resolution-1",
        work_id: blocked.work_id,
        blocker_kind: "permission",
        blocker_ref: "permission:repository-read",
        resolution_evidence_refs: ["evidence:permission-granted"],
        verified: true,
      },
    }, "planned")).toEqual({ ok: true })
  })

  it("rejects work records with blank unblock evidence items", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "blocked",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "unknown",
        recommended_action: "stop_blocked",
        reason: "The work is blocked until permission is provided.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Wait for permission.",
      },
      unblock_evidence: ["  "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.unblock_evidence[0]",
      code: "contract_validation_failed",
      message: "unblock_evidence items must be non-empty.",
    })
  })

  it("rejects work records with duplicate unblock evidence after trim", () => {
    const result = validateWorkRecord(validWorkRecord({
      status: "blocked",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "unknown",
        recommended_action: "stop_blocked",
        reason: "The work is blocked until permission is provided.",
      },
      action_decision: {
        selected_action: "stop_blocked",
        reason: "Wait for permission.",
      },
      unblock_evidence: ["User provided the missing permission.", " User provided the missing permission. "],
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.unblock_evidence[1]",
      code: "contract_validation_failed",
      message: "unblock_evidence items must be unique.",
    })
  })

  it("requires structured partial evidence before running work can become partial", () => {
    const running = validWorkRecord({
      status: "running",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "Report partial progress with recovery context.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report achieved work and continue recovery.",
      },
    })

    expect(canTransitionWorkRecordStatus(running, "partial")).toEqual({
      ok: false,
      reasonCode: "partial_criteria_not_met",
      message: PARTIAL_CRITERIA_MESSAGE,
    })
    expect(canTransitionWorkRecordStatus({
      ...running,
      step_plan: [
        ...running.step_plan,
        {
          ...running.step_plan[0],
          step_id: "step-2",
          status: "running",
        },
      ],
      failure_diagnosis: {
        failed_step_id: "step-2",
        failure_reason: "permission_missing",
        failed_input_refs: ["screen-control"],
        failed_strategy: "use_yeonjang:screen",
        recoverable: true,
      },
      recovery_candidates: [{
        action_type: "ask_clarification",
        changed_input_or_strategy: "Ask the user for the missing permission.",
        expected_benefit: "The user can resolve the blocker.",
        risk: "low",
        changed_dimensions: ["permission"],
      }],
    }, "partial")).toEqual({ ok: true })
  })

  it("rejects running to partial transitions when failure diagnosis points to a missing step", () => {
    const running = validWorkRecord({
      status: "running",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "Report partial progress with recovery context.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report achieved work and continue recovery.",
      },
      failure_diagnosis: {
        failed_step_id: "missing-step",
        failure_reason: "permission_missing",
        failed_input_refs: ["screen-control"],
        failed_strategy: "use_yeonjang:screen",
        recoverable: true,
      },
      recovery_candidates: [{
        action_type: "ask_clarification",
        changed_input_or_strategy: "Ask the user for the missing permission.",
        expected_benefit: "The user can resolve the blocker.",
        risk: "low",
        changed_dimensions: ["permission"],
      }],
    })

    expect(canTransitionWorkRecordStatus(running, "partial")).toEqual({
      ok: false,
      reasonCode: "partial_criteria_not_met",
      message: PARTIAL_CRITERIA_MESSAGE,
    })
  })

  it("rejects running to partial transitions when failure diagnosis is not recoverable", () => {
    const running = validWorkRecord({
      status: "running",
      step_plan: [
        ...validWorkRecord().step_plan,
        {
          ...validWorkRecord().step_plan[0],
          step_id: "step-2",
          status: "running",
        },
      ],
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "partial_report",
        reason: "Report partial progress with recovery context.",
      },
      action_decision: {
        selected_action: "partial_report",
        reason: "Report achieved work and continue recovery.",
      },
      failure_diagnosis: {
        failed_step_id: "step-2",
        failure_reason: "permission_missing",
        failed_input_refs: ["screen-control"],
        failed_strategy: "use_yeonjang:screen",
        recoverable: false,
      },
      recovery_candidates: [{
        action_type: "ask_clarification",
        changed_input_or_strategy: "Ask the user for the missing permission.",
        expected_benefit: "The user can resolve the blocker.",
        risk: "low",
        changed_dimensions: ["permission"],
      }],
    })

    expect(canTransitionWorkRecordStatus(running, "partial")).toEqual({
      ok: false,
      reasonCode: "partial_criteria_not_met",
      message: PARTIAL_CRITERIA_MESSAGE,
    })
  })

  it("rejects running to partial transitions when action decision does not match result diagnosis", () => {
    const running = validWorkRecord({
      status: "running",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
        recommended_action: "retry",
        reason: "Retry is the diagnosed next action.",
      },
      failure_diagnosis: {
        failed_step_id: "step-2",
        failure_reason: "permission_missing",
        failed_input_refs: ["screen-control"],
        failed_strategy: "use_yeonjang:screen",
        recoverable: true,
      },
      recovery_candidates: [{
        action_type: "ask_clarification",
        changed_input_or_strategy: "Ask the user for the missing permission.",
        expected_benefit: "The user can resolve the blocker.",
        risk: "low",
        changed_dimensions: ["permission"],
      }],
      action_decision: {
        selected_action: "partial_report",
        reason: "This contradicts the retry diagnosis.",
      },
    })

    expect(canTransitionWorkRecordStatus(running, "partial")).toEqual({
      ok: false,
      reasonCode: "partial_criteria_not_met",
      message: PARTIAL_CRITERIA_MESSAGE,
    })
  })

  it("rejects running to partial transitions when recovery candidates repeat the failed strategy", () => {
    const running = validWorkRecord({
      status: "running",
      result_diagnosis: {
        ...validWorkRecord().result_diagnosis,
        sufficiency: "partial",
      },
      failure_diagnosis: {
        failed_step_id: "step-2",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recovery_candidates: [{
        action_type: "use_tool",
        changed_input_or_strategy: "use_tool:a",
        expected_benefit: "Try the same call again.",
        risk: "low",
        changed_dimensions: [],
      }],
      action_decision: {
        selected_action: "retry",
        reason: "Retry without changing the failed strategy.",
      },
    })

    expect(canTransitionWorkRecordStatus(running, "partial")).toEqual({
      ok: false,
      reasonCode: "partial_criteria_not_met",
      message: PARTIAL_CRITERIA_MESSAGE,
    })
  })

  it("rejects recovery candidates that repeat the same failed input and strategy", () => {
    const failure = {
      failed_step_id: "step-1",
      failure_reason: "tool_unavailable",
      failed_input_refs: ["same-input"],
      failed_strategy: "use_tool:a",
      recoverable: true,
    }

    expect(validateRecoveryCandidateAgainstFailure(failure, {
      action_type: "use_tool",
      changed_input_or_strategy: "use_tool:a",
      expected_benefit: "Try the same call again.",
      risk: "low",
      changed_dimensions: [],
    })).toEqual({
      ok: false,
      issues: [{
        path: "$.changed_dimensions",
        code: "contract_validation_failed",
        message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
      }],
    })

    const changed = validateRecoveryCandidateAgainstFailure(failure, {
      action_type: "use_tool",
      changed_input_or_strategy: "Use tool b instead of tool a.",
      expected_benefit: "The alternate tool is available.",
      risk: "low",
      changed_dimensions: ["tool"],
    })

    expect(changed.ok).toBe(true)
  })
})
