import { describe, expect, it } from "vitest"
import {
  createStructuredDelegationHandoff,
  decideEvidenceBasedDelegation,
  mergeStructuredChildResultIntoParent,
  validateRecoveryCandidateAgainstFailure,
  validateWorkRecord,
  type ChildWorkResult,
  type FailureDiagnosis,
  type RecoveryCandidate,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis = {
  diagnosis_summary: "Repository verification is requested.",
  intent: "verify_repository",
  goal: "Verify the repository.",
  constraints: ["Read only."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate" as const,
  reason: "Independent verification has explicit value.",
}

function parentRecord(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-parent",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "Verify the repository.",
    request_diagnosis: requestDiagnosis,
    step_plan: [
      {
        step_id: "prepare",
        owner_agent_name: "마당쇠",
        action_type: "plan",
        input_refs: ["request:1"],
        expected_output: "Prepared repository context.",
        completion_criteria: "Context is ready.",
        status: "completed",
      },
      {
        step_id: "review",
        owner_agent_name: "마당쇠",
        action_type: "delegate",
        input_refs: ["context:repository"],
        expected_output: "An independent verification result.",
        completion_criteria: "Evidence confirms repository validity.",
        status: "running",
      },
    ],
    step_results: [{
      step_id: "prepare",
      status: "completed",
      output_ref: "artifact:prepared-context",
      evidence_refs: ["evidence:prepared"],
      completed_at: 10,
    }],
    result_diagnosis: {
      diagnosis_summary: "Delegated verification is pending.",
      sufficiency: "unknown",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "low",
      recommended_action: "delegate",
      reason: "The child result has not arrived.",
    },
    retry_count: 0,
    retry_limit: 2,
    stop_condition: "Stop when independent verification is proven or the retry limit is reached.",
    action_decision: {
      selected_action: "delegate",
      reason: "Independent verification is justified.",
      next_step_id: "review",
    },
  }
}

function handoff(parent = parentRecord()) {
  const decision = decideEvidenceBasedDelegation({
    parentAgentName: "마당쇠",
    targetAgentName: "검토자",
    availableAgentCount: 1,
    targetActive: true,
    targetIsDirectChild: true,
    baseEligibility: { state: "eligible", reasonCodes: ["eligible"] },
    targetCapabilityEvidenceRefs: ["capability:review"],
    benefits: [{ kind: "independent_review", evidenceRefs: ["evidence:benefit"] }],
    localExecutionCost: 2,
    delegationCost: 1,
    localCapabilityUnavailable: false,
  })
  return createStructuredDelegationHandoff({
    decision,
    parentRecord: parent,
    parentStepId: "review",
    childWorkId: "work-child",
    handoffId: "handoff-1",
    explicitContextRefs: ["context:repository"],
    allowedTools: ["repo.read"],
    disallowedActions: ["filesystem.write"],
    validationMethod: "Compare evidence with the completion criterion.",
    failureRecoveryPolicy: "Retry with a changed tool after failure.",
    deadlineOrBudget: "One review cycle.",
  })
}

function completedChild(): ChildWorkResult {
  return {
    schemaVersion: 1,
    work_id: "work-child",
    agent_name: "검토자",
    task_goal: requestDiagnosis.goal,
    status: "completed",
    completed_steps: ["review"],
    failed_steps: [],
    summary: "Verification completed.",
    result: "The repository satisfies the criterion.",
    evidence: ["evidence:child-review"],
    assumptions: [],
    risks: [],
    missing_information: [],
    actions_taken: ["reviewed:repository"],
    tools_used: ["repo.read"],
    result_diagnosis: {
      diagnosis_summary: "The delegated result is sufficient.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "Evidence satisfies the delegated criterion.",
    },
    action_decision: { selected_action: "final_report", reason: "Return for parent review." },
    failure_diagnosis: null,
    recovery_attempts: [],
    needs_parent_review: true,
    recommended_next_step: "Parent review is required.",
  }
}

const failure: FailureDiagnosis = {
  failed_step_id: "review",
  failure_reason: "Primary tool did not return evidence.",
  failed_input_refs: ["context:repository"],
  failed_strategy: "Primary Tool",
  recoverable: true,
}

const recovery: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "Use secondary repository reader",
  expected_benefit: "Avoid the failed primary tool.",
  risk: "low",
  changed_dimensions: ["tool"],
  metadata: { tool: "repo.secondary.read" },
}

function failedChild(status: "partial" | "failed" | "blocked" = "failed"): ChildWorkResult {
  const selectedAction = status === "blocked" ? "stop_blocked" : "retry"
  return {
    ...completedChild(),
    status,
    completed_steps: [],
    failed_steps: status === "blocked" ? [] : ["review"],
    summary: "Verification did not complete.",
    result: "No sufficient verification result.",
    evidence: ["evidence:tool-failure"],
    risks: status === "blocked" ? ["Permission is unavailable."] : [],
    missing_information: status === "blocked" ? ["Required permission."] : [],
    result_diagnosis: {
      diagnosis_summary: "The delegated result is not sufficient.",
      sufficiency: status === "partial" ? "partial" : "insufficient",
      missing_information: status === "blocked" ? ["Required permission."] : [],
      conflicts: [],
      risk: "low",
      risks: [],
      confidence: "high",
      recommended_action: selectedAction,
      reason: "Parent review must choose the next action.",
    },
    action_decision: { selected_action: selectedAction, reason: "Return failure for parent review." },
    failure_diagnosis: status === "blocked" ? null : failure,
    recovery_attempts: status === "blocked" ? [] : [recovery],
  }
}

describe("task1275 parent WorkRecord merge", () => {
  it("immutably merges a completed child into only the selected parent step", () => {
    const parent = parentRecord()
    const original = structuredClone(parent)
    const result = mergeStructuredChildResultIntoParent({
      parentRecord: parent,
      handoff: handoff(parent),
      childResult: completedChild(),
      mergedAt: 100,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(parent).toEqual(original)
    expect(result.record.status).toBe("running")
    expect(result.record.step_plan).toEqual([
      original.step_plan[0],
      { ...original.step_plan[1], status: "completed" },
    ])
    expect(result.record.step_results).toEqual([
      original.step_results[0],
      {
        step_id: "review",
        status: "completed",
        output_ref: "result:work-child",
        evidence_refs: ["evidence:child-review"],
        completed_at: 100,
      },
    ])
    expect(result.record.result_diagnosis).toEqual(completedChild().result_diagnosis)
    expect(result.record.failure_diagnosis).toBeUndefined()
    expect(result.record.recovery_candidates).toBeUndefined()
    expect(result.record.action_decision).toEqual(completedChild().action_decision)
    expect(result.requiresParentReview).toBe(true)
    expect(validateWorkRecord(result.record).ok).toBe(true)
  })

  it.each([
    ["partial", "running", "partial"],
    ["failed", "failed", "failed"],
    ["blocked", "blocked", "blocked"],
  ] as const)("merges %s without finalizing the parent", (status, stepStatus, resultStatus) => {
    const parent = parentRecord()
    const child = failedChild(status)
    const result = mergeStructuredChildResultIntoParent({
      parentRecord: parent,
      handoff: handoff(parent),
      childResult: child,
      mergedAt: 101,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.status).toBe("running")
    expect(result.record.step_plan.find((step) => step.step_id === "review")?.status).toBe(stepStatus)
    expect(result.record.step_results.at(-1)?.status).toBe(resultStatus)
    expect(result.record.result_diagnosis).toEqual(child.result_diagnosis)
    expect(result.record.failure_diagnosis).toEqual(child.failure_diagnosis ?? undefined)
    expect(result.record.recovery_candidates).toEqual(child.recovery_attempts.length > 0 ? child.recovery_attempts : undefined)
    expect(validateWorkRecord(result.record).ok).toBe(true)
  })

  it("rejects linkage mismatches and duplicate merges without mutating the parent", () => {
    const parent = parentRecord()
    const original = structuredClone(parent)
    const mismatch = mergeStructuredChildResultIntoParent({
      parentRecord: parent,
      handoff: handoff(parent),
      childResult: { ...completedChild(), agent_name: "다른 검토자" },
      mergedAt: 100,
    })
    expect(mismatch).toMatchObject({ ok: false, reasonCode: "linkage_mismatch" })
    expect(parent).toEqual(original)

    const first = mergeStructuredChildResultIntoParent({
      parentRecord: parent,
      handoff: handoff(parent),
      childResult: completedChild(),
      mergedAt: 100,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const duplicate = mergeStructuredChildResultIntoParent({
      parentRecord: first.record,
      handoff: handoff(parent),
      childResult: completedChild(),
      mergedAt: 101,
    })
    expect(duplicate).toMatchObject({ ok: false, reasonCode: "duplicate_child_result" })
  })
})

describe("task1275 changed-dimension recovery", () => {
  it.each([" primary   tool ", " CONTEXT:REPOSITORY "])(
    "rejects a normalized repeat disguised as a change: %s",
    (changed) => {
      expect(validateRecoveryCandidateAgainstFailure(failure, {
        ...recovery,
        changed_input_or_strategy: changed,
      }).ok).toBe(false)
    },
  )

  it("accepts a candidate that records a concrete changed tool", () => {
    expect(validateRecoveryCandidateAgainstFailure(failure, recovery)).toEqual({
      ok: true,
      value: recovery,
      issues: [],
    })
  })
})
