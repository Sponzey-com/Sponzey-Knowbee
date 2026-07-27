import { describe, expect, it } from "vitest"
import {
  canTransitionWorkRecordStatus,
  decideWorkRecordRunningExit,
  type RecoveryCandidate,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

const recoveryCandidate: RecoveryCandidate = {
  action_type: "use_tool",
  changed_input_or_strategy: "Use the alternate verified tool.",
  expected_benefit: "The remaining step can complete.",
  risk: "low",
  changed_dimensions: ["tool"],
  metadata: { candidate_id: "recovery:alternate-tool" },
}

function runningRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-running-exit",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "Complete two verified goals.",
    request_diagnosis: {
      diagnosis_summary: "Two goals require execution and verification.",
      intent: "execute_goals",
      goal: "Complete two verified goals.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The work requires ordered execution.",
    },
    step_plan: [
      {
        step_id: "step-complete",
        owner_agent_name: "마당쇠",
        action_type: "use_tool",
        input_refs: ["input:first"],
        expected_output: "Verified first result.",
        completion_criteria: "A result and evidence receipt exist.",
        status: "completed",
      },
      {
        step_id: "step-remaining",
        owner_agent_name: "마당쇠",
        action_type: "use_tool",
        input_refs: ["input:second"],
        expected_output: "Verified second result.",
        completion_criteria: "A result and evidence receipt exist.",
        status: "completed",
      },
    ],
    step_results: [
      {
        step_id: "step-complete",
        status: "completed",
        output_ref: "result:first",
        evidence_refs: ["evidence:first"],
      },
      {
        step_id: "step-remaining",
        status: "completed",
        output_ref: "result:second",
        evidence_refs: ["evidence:second"],
      },
    ],
    result_diagnosis: {
      diagnosis_summary: "Both required goals are verified.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "All completion criteria have evidence.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "Return the verified result.",
    },
    ...overrides,
  }
}

function partialRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  const base = runningRecord()
  return runningRecord({
    step_plan: [
      base.step_plan[0],
      { ...base.step_plan[1], status: "failed" },
    ],
    step_results: [
      base.step_results[0],
      {
        step_id: "step-remaining",
        status: "failed",
        evidence_refs: ["evidence:tool-unavailable"],
        error: "The primary tool is unavailable.",
      },
    ],
    result_diagnosis: {
      ...base.result_diagnosis,
      diagnosis_summary: "The first goal is verified and the second remains.",
      sufficiency: "partial",
      recommended_action: "retry",
      reason: "Retry the remaining goal with a changed tool.",
    },
    failure_diagnosis: {
      failed_step_id: "step-remaining",
      failure_reason: "primary_tool_unavailable",
      failed_input_refs: ["input:second"],
      failed_strategy: "use_tool:primary",
      recoverable: true,
    },
    recovery_candidates: [recoveryCandidate],
    selected_recovery_action: recoveryCandidate,
    action_decision: {
      selected_action: "retry",
      reason: "Use the selected changed recovery candidate.",
    },
    ...overrides,
  })
}

describe("task1278 running exit decision", () => {
  it("completes only with verified results for every required step", () => {
    const record = runningRecord()
    const snapshot = structuredClone(record)

    expect(decideWorkRecordRunningExit(record, "completed")).toEqual({
      status: "completed",
      reasonCode: "completion_criteria_met",
      targetStatus: "completed",
      completedStepIds: ["step-complete", "step-remaining"],
      evidenceRefs: ["evidence:first", "evidence:second"],
    })
    expect(canTransitionWorkRecordStatus(record, "completed")).toEqual({ ok: true })
    expect(record).toEqual(snapshot)
  })

  it.each([
    ["missing output", { output_ref: undefined, evidence_refs: ["evidence:second"] }],
    ["missing evidence", { output_ref: "result:second", evidence_refs: [] }],
  ])("rejects completed when a required result has %s", (_label, resultPatch) => {
    const base = runningRecord()
    const record = runningRecord({
      step_results: [base.step_results[0], { ...base.step_results[1], ...resultPatch }],
    })

    expect(decideWorkRecordRunningExit(record, "completed")).toEqual({
      status: "rejected",
      reasonCode: "completion_criteria_not_met",
      targetStatus: null,
    })
  })

  it("returns structured achieved, unmet, failure, recovery, and next-action facts for partial work", () => {
    const record = partialRecord()
    const snapshot = structuredClone(record)

    expect(decideWorkRecordRunningExit(record, "partial")).toEqual({
      status: "partial",
      reasonCode: "partial_criteria_met",
      targetStatus: "partial",
      achievedStepIds: ["step-complete"],
      unmetStepIds: ["step-remaining"],
      failedStepId: "step-remaining",
      failureReason: "primary_tool_unavailable",
      recoveryCandidates: [recoveryCandidate],
      nextAction: "retry",
    })
    expect(canTransitionWorkRecordStatus(record, "partial")).toEqual({ ok: true })
    expect(record).toEqual(snapshot)
  })

  it.each([
    ["no achieved goal", () => {
      const base = partialRecord()
      return partialRecord({
        step_plan: base.step_plan.map((step) => ({ ...step, status: "failed" })),
        step_results: base.step_results.map((result) => result.step_id === "step-complete"
          ? { step_id: result.step_id, status: "failed", evidence_refs: ["evidence:first-failed"], error: "First goal failed." }
          : result),
      })
    }],
    ["no unmet goal", () => {
      const base = partialRecord()
      return partialRecord({ step_plan: base.step_plan.map((step) => ({ ...step, status: "completed" })) })
    }],
    ["selected recovery metadata mismatch", () => partialRecord({
      selected_recovery_action: {
        ...recoveryCandidate,
        metadata: { candidate_id: "recovery:different" },
      },
    })],
  ])("rejects partial when structured facts contain %s", (_label, createRecord) => {
    const record = createRecord()
    const snapshot = structuredClone(record)

    expect(decideWorkRecordRunningExit(record, "partial")).toEqual({
      status: "rejected",
      reasonCode: "partial_criteria_not_met",
      targetStatus: null,
    })
    expect(record).toEqual(snapshot)
  })

  it("rejects non-running records without changing them", () => {
    const record = runningRecord({ status: "waiting" })

    expect(decideWorkRecordRunningExit(record, "completed")).toEqual({
      status: "rejected",
      reasonCode: "running_status_required",
      targetStatus: null,
    })
  })
})
