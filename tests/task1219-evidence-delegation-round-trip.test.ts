import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createStructuredDelegationHandoff,
  decideEvidenceBasedDelegation,
  validateStructuredDelegationRoundTrip,
  validateWorkHandoffPackage,
  type ChildWorkResult,
  type DelegationBenefitKind,
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
const resultDiagnosis = {
  diagnosis_summary: "Verification is complete.",
  sufficiency: "sufficient" as const,
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report" as const,
  reason: "Evidence satisfies the criterion.",
}

const parentRecord: WorkRecord = {
  schemaVersion: 1,
  work_id: "work-parent",
  owner_agent_name: "마당쇠",
  source: "user",
  status: "running",
  user_request_summary: "Verify the repository.",
  request_diagnosis: requestDiagnosis,
  step_plan: [{
    step_id: "review",
    owner_agent_name: "마당쇠",
    action_type: "delegate",
    input_refs: ["request:1"],
    expected_output: "An independent verification result.",
    completion_criteria: "Evidence confirms repository validity.",
    status: "running",
  }],
  step_results: [],
  result_diagnosis: {
    ...resultDiagnosis,
    sufficiency: "unknown",
    recommended_action: "delegate",
    diagnosis_summary: "Delegated verification is pending.",
    reason: "The child result has not arrived.",
  },
  retry_count: 0,
  retry_limit: 1,
  stop_condition: "Stop after one reviewed child result or one failed retry.",
  action_decision: { selected_action: "delegate", reason: "Independent verification is justified.", next_step_id: "review" },
}

function decisionInput(benefitKind: DelegationBenefitKind = "independent_review") {
  return {
    parentAgentName: "마당쇠",
    targetAgentName: "검토자",
    availableAgentCount: 3,
    targetActive: true,
    targetIsDirectChild: true,
    baseEligibility: { state: "eligible" as const, reasonCodes: ["delegation_policy_satisfied"] },
    targetCapabilityEvidenceRefs: ["capability:review"],
    benefits: [{ kind: benefitKind, evidenceRefs: [`benefit:${benefitKind}`] }],
    localExecutionCost: 5,
    delegationCost: 3,
    localCapabilityUnavailable: benefitKind === "specialty",
  }
}

describe("task1219 evidence-based delegation and round-trip", () => {
  it("keeps work local when agents exist but no concrete delegation benefit exists", () => {
    expect(decideEvidenceBasedDelegation({ ...decisionInput(), benefits: [] })).toEqual({
      outcome: "keep_local",
      reasonCode: "delegation_benefit_missing",
      benefitKinds: [],
      targetAgentName: "검토자",
    })
  })

  it.each([
    "specialty",
    "parallelism",
    "independent_review",
    "verification",
    "workflow_decomposition",
  ] satisfies DelegationBenefitKind[])("delegates when %s has evidence and the target is eligible", (kind) => {
    expect(decideEvidenceBasedDelegation(decisionInput(kind))).toMatchObject({
      outcome: "delegate",
      reasonCode: "delegation_justified",
      benefitKinds: [kind],
      targetAgentName: "검토자",
    })
  })

  it("keeps work local when delegation costs more without a local capability gap", () => {
    expect(decideEvidenceBasedDelegation({
      ...decisionInput("parallelism"),
      delegationCost: 8,
      localExecutionCost: 2,
    })).toMatchObject({ outcome: "keep_local", reasonCode: "local_execution_preferred" })
  })

  it.each([
    ["self delegation", { targetAgentName: "마당쇠" }, "self_delegation_denied"],
    ["non-child target", { targetIsDirectChild: false }, "target_not_direct_child"],
    ["inactive target", { targetActive: false }, "target_inactive"],
    ["missing skill evidence", { targetCapabilityEvidenceRefs: [] }, "target_capability_unproven"],
    ["base policy rejection", { baseEligibility: { state: "rejected" as const, reasonCodes: ["permission_required"] } }, "permission_required"],
    ["internal ID name", { targetAgentName: "agent:child-1" }, "user_facing_name_required"],
  ])("rejects %s", (_name, override, reasonCode) => {
    expect(decideEvidenceBasedDelegation({ ...decisionInput(), ...override })).toMatchObject({
      outcome: "rejected",
      reasonCode,
    })
  })

  it("creates a canonical explicit-memory handoff from the parent work record", () => {
    const decision = decideEvidenceBasedDelegation(decisionInput())
    const handoff = createStructuredDelegationHandoff({
      decision,
      parentRecord,
      parentStepId: "review",
      childWorkId: "work-child",
      handoffId: "handoff-1",
      explicitContextRefs: ["context:repository-snapshot", "evidence:baseline-test"],
      allowedTools: ["repo.read"],
      disallowedActions: ["filesystem.write"],
      validationMethod: "Compare the result with the parent completion criterion.",
      failureRecoveryPolicy: "Return a structured failed result after one retry with a changed strategy.",
      deadlineOrBudget: "One review cycle.",
    })
    expect(handoff).toMatchObject({
      work_id: "work-child",
      parent_work_id: "work-parent",
      parent_step_id: "review",
      parent_agent_name: "마당쇠",
      target_agent_name: "검토자",
      memory_visibility: "explicit_handoff_only",
      return_format: "ChildWorkResult",
    })
    expect(handoff.context).toEqual(["context:repository-snapshot", "evidence:baseline-test"])
    expect(validateWorkHandoffPackage(handoff).ok).toBe(true)
  })

  it("validates a child result against the same work, step, agent, goal, and evidence boundary", () => {
    const handoff = createStructuredDelegationHandoff({
      decision: decideEvidenceBasedDelegation(decisionInput()),
      parentRecord,
      parentStepId: "review",
      childWorkId: "work-child",
      handoffId: "handoff-1",
      explicitContextRefs: ["context:repository-snapshot"],
      allowedTools: [],
      disallowedActions: [],
      validationMethod: "Review evidence.",
      failureRecoveryPolicy: "Return failure after one retry with a changed strategy.",
      deadlineOrBudget: "One review cycle.",
    })
    const childResult: ChildWorkResult = {
      schemaVersion: 1,
      work_id: "work-child",
      agent_name: "검토자",
      task_goal: "Verify the repository.",
      status: "completed",
      completed_steps: ["review"],
      failed_steps: [],
      summary: "Repository verification completed.",
      result: "The repository meets the completion criterion.",
      evidence: ["evidence:child-test"],
      assumptions: [],
      risks: [],
      missing_information: [],
      actions_taken: ["reviewed:repository"],
      tools_used: [],
      result_diagnosis: resultDiagnosis,
      action_decision: { selected_action: "final_report", reason: "Evidence is sufficient." },
      failure_diagnosis: null,
      recovery_attempts: [],
      needs_parent_review: true,
      recommended_next_step: "Parent should review and aggregate the result.",
    }
    expect(validateStructuredDelegationRoundTrip({ parentRecord, handoff, childResult })).toEqual({
      ok: true,
      parentWorkId: "work-parent",
      childWorkId: "work-child",
      parentStepId: "review",
      targetAgentName: "검토자",
      evidenceRefs: ["evidence:child-test"],
    })
    expect(() => validateStructuredDelegationRoundTrip({
      parentRecord,
      handoff,
      childResult: { ...childResult, agent_name: "다른 검토자" },
    })).toThrow(/child agent name does not match/i)
  })

  it("rejects raw memory text and malformed context references", () => {
    expect(() => createStructuredDelegationHandoff({
      decision: decideEvidenceBasedDelegation(decisionInput()),
      parentRecord,
      parentStepId: "review",
      childWorkId: "work-child",
      handoffId: "handoff-1",
      explicitContextRefs: ["User prefers private output."],
      allowedTools: [],
      disallowedActions: [],
      validationMethod: "Review evidence.",
      failureRecoveryPolicy: "Return failure.",
      deadlineOrBudget: "One review cycle.",
    })).toThrow(/explicit context reference/i)
  })

  it("keeps the decision and round-trip owner independent from adapters", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/evidence-delegation.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/)
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
  })
})
