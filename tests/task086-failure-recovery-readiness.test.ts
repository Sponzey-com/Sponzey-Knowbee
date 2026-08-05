import { describe, expect, it } from "vitest"
import type { StructuredFailureRecoveryDecision } from "../packages/core/src/contracts/failure-recovery-decision.ts"
import {
  type FailureRecoveryReadinessDiagnosis,
  decideFailureRecoveryReadiness,
} from "../packages/core/src/contracts/failure-recovery-readiness.ts"
import type { LlmCapabilitySelectionAdmission } from "../packages/core/src/contracts/llm-capability-selection.ts"
import type { RecoveryCandidate, WorkRecord } from "../packages/core/src/contracts/work-record.ts"

const recoveryCandidate: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "Use the current web capability instead of the failed cache.",
  expected_benefit: "Retrieve current direct evidence.",
  risk: "low",
  changed_dimensions: ["tool", "strategy"],
  metadata: {
    capabilityId: "web.search",
    targetId: "agent:research",
    strategyFingerprint: "strategy:web-current:v2",
  },
}

function record(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-86",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "failed",
    user_request_summary: "Retrieve and verify the current value.",
    request_diagnosis: {
      diagnosis_summary: "A current value is required.",
      intent: "current_fact",
      goal: "Return a verified current value.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The request requires retrieval and verification.",
    },
    step_plan: [
      {
        step_id: "collect",
        owner_agent_name: "마당쇠",
        action_type: "use_tool",
        input_refs: ["request:86"],
        expected_output: "A source candidate.",
        completion_criteria: "A source response is preserved.",
        status: "completed",
      },
      {
        step_id: "verify",
        owner_agent_name: "마당쇠",
        action_type: "validate",
        input_refs: ["result:collect"],
        expected_output: "A verified current value.",
        completion_criteria: "Fresh direct evidence confirms the value.",
        status: "failed",
      },
    ],
    step_results: [
      {
        step_id: "collect",
        status: "completed",
        output_ref: "result:collect",
        evidence_refs: ["evidence:source-response"],
        completed_at: 1,
      },
      {
        step_id: "verify",
        status: "failed",
        evidence_refs: ["evidence:stale-value"],
        error: "source_value_stale",
      },
    ],
    result_diagnosis: {
      diagnosis_summary: "Freshness verification failed.",
      sufficiency: "insufficient",
      missing_information: [],
      conflicts: [],
      risk: "low",
      risks: [],
      confidence: "high",
      recommended_action: "retry",
      reason: "A current direct source remains available.",
    },
    failure_diagnosis: {
      failed_step_id: "verify",
      failure_reason: "source_value_stale",
      failed_input_refs: ["result:collect"],
      failed_strategy: "Use the cached source value.",
      recoverable: true,
    },
    recovery_candidates: [recoveryCandidate],
    selected_recovery_action: recoveryCandidate,
    retry_count: 1,
    retry_limit: 3,
    stop_condition: "Stop only after changed strategies are exhausted.",
    action_decision: { selected_action: "retry", reason: "Use current direct evidence." },
  }
}

function diagnosis(
  overrides: Partial<FailureRecoveryReadinessDiagnosis> = {},
): FailureRecoveryReadinessDiagnosis {
  return {
    workId: "work-86",
    unsatisfiedStepIds: ["verify"],
    obtainedResultStepIds: ["collect", "verify"],
    obtainedEvidenceRefs: ["evidence:source-response", "evidence:stale-value"],
    ...overrides,
  }
}

function recoveryDecision(): StructuredFailureRecoveryDecision {
  return {
    state: "retry_ready",
    outcome: "retry",
    receiptId: "receipt:diagnosis:86",
    selectedCandidate: recoveryCandidate,
    changedDimensions: ["tool", "strategy"],
    nextAttemptSignature: "attempt:web-current:v2",
    evidenceRefs: ["evidence:runtime-ready", "evidence:policy-allowed"],
    partialResultRefs: [],
    unresolvedScope: ["verify"],
    userActions: [],
    stateTrace: [
      "diagnosing",
      "generating_candidates",
      "reviewing_constraints",
      "selecting_action",
      "retry_ready",
    ],
  }
}

function capabilityAdmission(
  status: "allowed" | "approval_required" = "allowed",
): LlmCapabilitySelectionAdmission {
  return {
    status,
    receiptId: "receipt:capability:86",
    selectedBinding: { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
  }
}

function decide(overrides: Partial<Parameters<typeof decideFailureRecoveryReadiness>[0]> = {}) {
  return decideFailureRecoveryReadiness({
    workId: "work-86",
    workRecord: record(),
    diagnosis: diagnosis(),
    recoveryDecision: recoveryDecision(),
    capabilityAdmission: capabilityAdmission(),
    cancellationRequested: false,
    ...overrides,
  })
}

describe("Task 086 failure recovery readiness", () => {
  it("accepts exact unsatisfied steps and obtained evidence with a safe executable changed strategy", () => {
    expect(decide()).toEqual({
      status: "ready",
      workId: "work-86",
      unsatisfiedStepIds: ["verify"],
      obtainedResultStepIds: ["collect", "verify"],
      obtainedEvidenceRefs: ["evidence:source-response", "evidence:stale-value"],
      recoveryReceiptId: "receipt:diagnosis:86",
      capabilityReceiptId: "receipt:capability:86",
      selectedBinding: { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
    })
  })

  it("rejects missing or invented unsatisfied completion steps", () => {
    expect(decide({ diagnosis: diagnosis({ unsatisfiedStepIds: [] }) })).toMatchObject({
      status: "rejected",
      reasonCodes: ["unsatisfied_steps_mismatch"],
    })
    expect(
      decide({ diagnosis: diagnosis({ unsatisfiedStepIds: ["verify", "invented"] }) }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["unsatisfied_steps_mismatch"],
    })
  })

  it("rejects missing, invented, or cross-work obtained result evidence", () => {
    expect(
      decide({ diagnosis: diagnosis({ obtainedEvidenceRefs: ["evidence:source-response"] }) }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["obtained_evidence_mismatch"],
    })
    expect(
      decide({
        diagnosis: diagnosis({
          obtainedEvidenceRefs: ["evidence:source-response", "evidence:foreign"],
        }),
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["obtained_evidence_mismatch"],
    })
    expect(decide({ diagnosis: diagnosis({ workId: "work:foreign" }) })).toMatchObject({
      status: "rejected",
      reasonCodes: ["work_scope_mismatch"],
    })
  })

  it("rejects unavailable, approval-pending, mismatched, or cancelled next actions", () => {
    expect(decide({ capabilityAdmission: capabilityAdmission("approval_required") })).toMatchObject(
      {
        status: "rejected",
        reasonCodes: ["next_action_not_executable"],
      },
    )
    expect(decide({ cancellationRequested: true })).toMatchObject({
      status: "rejected",
      reasonCodes: ["recovery_cancelled"],
    })
    expect(
      decide({
        capabilityAdmission: {
          ...capabilityAdmission(),
          selectedBinding: { capabilityId: "web.search", targetId: "agent:other", risk: "safe" },
        },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["next_action_binding_mismatch"],
    })
  })
})
