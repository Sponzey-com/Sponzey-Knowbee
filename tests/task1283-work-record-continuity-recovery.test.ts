import { describe, expect, it } from "vitest"
import {
  createWorkRecoverySignature,
  decideWorkRecordContinuityRecoveryAcceptance,
  type ChildWorkResult,
  type RecoveryCandidate,
  type WorkHandoffPackage,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

const recovery: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "Use the secondary repository reader.",
  expected_benefit: "Avoid the failed primary tool.",
  risk: "low",
  changed_dimensions: ["tool"],
  metadata: { tool: "repo.secondary.read" },
}

function parent(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-parent",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "Verify the repository.",
    request_diagnosis: {
      diagnosis_summary: "Independent verification is required.",
      intent: "verify_repository",
      goal: "Verify the repository.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "delegate",
      reason: "A child agent can verify it.",
    },
    step_plan: [
      {
        step_id: "prepare",
        owner_agent_name: "마당쇠",
        action_type: "plan",
        input_refs: ["request:1"],
        expected_output: "Prepared repository context.",
        completion_criteria: "Context has evidence.",
        status: "completed",
      },
      {
        step_id: "review",
        owner_agent_name: "마당쇠",
        action_type: "delegate",
        input_refs: ["request:1"],
        expected_output: "Verified repository result.",
        completion_criteria: "The result has evidence.",
        status: "running",
      },
    ],
    step_results: [{
      step_id: "prepare",
      status: "completed",
      output_ref: "result:prepared",
      evidence_refs: ["evidence:prepared"],
    }],
    result_diagnosis: {
      diagnosis_summary: "Child verification is pending.",
      sufficiency: "unknown",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "low",
      recommended_action: "delegate",
      reason: "Wait for the child result.",
    },
    retry_count: 0,
    retry_limit: 2,
    stop_condition: "Stop after recovery options are exhausted.",
    action_decision: { selected_action: "delegate", reason: "Delegate verification.", next_step_id: "review" },
  }
}

function handoff(): WorkHandoffPackage {
  const childStep = {
    ...parent().step_plan.find((step) => step.step_id === "review")!,
    owner_agent_name: "검토자",
    status: "pending" as const,
  }
  return {
    schemaVersion: 1,
    handoff_id: "handoff-1",
    work_id: "work-child",
    parent_work_id: "work-parent",
    parent_step_id: "review",
    parent_agent_name: "마당쇠",
    target_agent_name: "검토자",
    task_goal: "Verify the repository.",
    user_request_summary: "Verify the repository.",
    request_diagnosis: parent().request_diagnosis,
    step_plan: [childStep],
    current_step: childStep,
    context: ["context:repository"],
    constraints: [],
    allowed_tools: ["repo.read"],
    disallowed_actions: ["filesystem.write"],
    expected_output: "Verified repository result.",
    quality_criteria: ["The result has evidence."],
    validation_method: "Check repository evidence.",
    retry_limit: 2,
    failure_recovery_policy: "Retry with a changed tool.",
    deadline_or_budget: "One review cycle.",
    memory_visibility: "explicit_handoff_only",
    return_format: "ChildWorkResult",
  }
}

function child(status: "completed" | "partial" | "failed" | "blocked" = "completed"): ChildWorkResult {
  const failed = status === "partial" || status === "failed"
  const blocked = status === "blocked"
  const action = blocked ? "stop_blocked" : failed ? "retry" : "final_report"
  return {
    schemaVersion: 1,
    work_id: "work-child",
    agent_name: "검토자",
    task_goal: "Verify the repository.",
    status,
    completed_steps: failed || blocked ? [] : ["review"],
    failed_steps: failed ? ["review"] : [],
    summary: blocked ? "Permission blocks verification." : failed ? "Primary verification failed." : "Verification completed.",
    result: failed || blocked ? "No verified result." : "Repository verified.",
    evidence: [blocked ? "evidence:permission" : failed ? "evidence:failure" : "evidence:verified"],
    assumptions: [],
    risks: blocked ? ["Repository permission is unavailable."] : [],
    missing_information: blocked ? ["Repository permission is required."] : [],
    actions_taken: [failed ? "attempted:primary" : "verified:repository"],
    tools_used: ["repo.read"],
    result_diagnosis: {
      diagnosis_summary: blocked ? "Permission is required." : failed ? "A changed retry can recover." : "The result is sufficient.",
      sufficiency: status === "completed" ? "sufficient" : status === "partial" ? "partial" : "insufficient",
      missing_information: blocked ? ["Repository permission is required."] : [],
      conflicts: [],
      risk: "low",
      risks: [],
      confidence: "high",
      recommended_action: action,
      reason: blocked ? "Report the permission blocker." : failed ? "Use a changed tool." : "Return for parent review.",
    },
    action_decision: { selected_action: action, reason: failed ? "Retry differently." : "Report result." },
    failure_diagnosis: failed ? {
      failed_step_id: "review",
      failure_reason: "primary_tool_failed",
      failed_input_refs: ["request:1"],
      failed_strategy: "Use primary repository reader.",
      recoverable: true,
    } : null,
    recovery_attempts: failed ? [recovery] : [],
    needs_parent_review: true,
    recommended_next_step: blocked ? "Resolve permission before continuing." : failed ? "Retry with the selected changed tool." : "Parent validates the result.",
  }
}

describe("task1283 WorkRecord continuity and recovery acceptance", () => {
  it("accepts completed parent-child lineage through the declared running to completed transition", () => {
    const result = decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: parent(),
      handoff: handoff(),
      childResult: child(),
      targetParentStatus: "completed",
      mergedAt: 100,
      previousRecoverySignatures: [],
    })
    expect(result).toMatchObject({
      status: "accepted",
      parentWorkId: "work-parent",
      childWorkId: "work-child",
      parentStepId: "review",
      transition: { fromStatus: "running", toStatus: "completed" },
      evidenceRefs: ["evidence:verified"],
      recovery: null,
    })
  })

  it.each(["failed", "partial"] as const)("accepts %s with one selected changed recovery", (status) => {
    const result = decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: parent(),
      handoff: handoff(),
      childResult: child(status),
      targetParentStatus: status,
      selectedRecoveryAction: recovery,
      mergedAt: 100,
      previousRecoverySignatures: [],
    })
    expect(result).toMatchObject({
      status: "accepted",
      transition: { fromStatus: "running", toStatus: status },
      recovery: {
        action: "retry",
        targetStatus: "planned",
        signature: createWorkRecoverySignature(recovery),
      },
    })
  })

  it("accepts a blocked child only through the declared running to blocked transition", () => {
    expect(decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: parent(),
      handoff: handoff(),
      childResult: child("blocked"),
      targetParentStatus: "blocked",
      mergedAt: 100,
      previousRecoverySignatures: [],
    })).toMatchObject({
      status: "accepted",
      transition: { fromStatus: "running", toStatus: "blocked" },
      evidenceRefs: ["evidence:permission"],
      recovery: null,
    })
  })

  it("accepts redelegation only when the selected changed candidate matches the child result", () => {
    const redelegate: RecoveryCandidate = {
      ...recovery,
      action_type: "redelegate",
      changed_input_or_strategy: "Delegate to the alternate verifier.",
      changed_dimensions: ["delegation_target"],
      metadata: { target: "대체 검토자" },
    }
    const failed = child("failed")
    failed.result_diagnosis = { ...failed.result_diagnosis, recommended_action: "redelegate" }
    failed.action_decision = { ...failed.action_decision, selected_action: "redelegate" }
    failed.recovery_attempts = [redelegate]
    expect(decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: parent(),
      handoff: handoff(),
      childResult: failed,
      targetParentStatus: "failed",
      selectedRecoveryAction: redelegate,
      mergedAt: 100,
      previousRecoverySignatures: [],
    })).toMatchObject({
      status: "accepted",
      recovery: { action: "redelegate", changedDimensions: ["delegation_target"] },
    })
  })

  it("rejects undeclared transitions and parent-child lineage mismatches", () => {
    expect(decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: { ...parent(), status: "waiting" },
      handoff: handoff(),
      childResult: child(),
      targetParentStatus: "completed",
      mergedAt: 100,
      previousRecoverySignatures: [],
    })).toMatchObject({ status: "rejected", reasonCode: "transition_not_allowed" })

    expect(decideWorkRecordContinuityRecoveryAcceptance({
      parentRecord: parent(),
      handoff: handoff(),
      childResult: { ...child(), agent_name: "다른 검토자" },
      targetParentStatus: "completed",
      mergedAt: 100,
      previousRecoverySignatures: [],
    })).toMatchObject({ status: "rejected", reasonCode: "linkage_mismatch" })
  })

  it("rejects a missing changed recovery and a previously failed recovery signature", () => {
    const base = {
      parentRecord: parent(),
      handoff: handoff(),
      childResult: child("failed"),
      targetParentStatus: "failed" as const,
      mergedAt: 100,
      previousRecoverySignatures: [] as string[],
    }
    expect(decideWorkRecordContinuityRecoveryAcceptance(base)).toMatchObject({
      status: "rejected",
      reasonCode: "recovery_action_required",
    })
    expect(decideWorkRecordContinuityRecoveryAcceptance({
      ...base,
      selectedRecoveryAction: recovery,
      previousRecoverySignatures: [createWorkRecoverySignature(recovery)],
    })).toMatchObject({ status: "rejected", reasonCode: "recovery_signature_repeated" })
  })

  it("does not mutate parent, handoff, child result, or recovery history", () => {
    const input = {
      parentRecord: parent(),
      handoff: handoff(),
      childResult: child("failed"),
      targetParentStatus: "failed" as const,
      selectedRecoveryAction: recovery,
      mergedAt: 100,
      previousRecoverySignatures: [] as string[],
    }
    const before = structuredClone(input)
    decideWorkRecordContinuityRecoveryAcceptance(input)
    expect(input).toEqual(before)
  })
})
