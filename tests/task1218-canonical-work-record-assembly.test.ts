import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type FailureDiagnosis,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type RecoveryCandidate,
  type StructuredWorkPlanDecision,
  type WorkStepResult,
  assembleCanonicalWorkRecord,
  validateWorkRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "A repository check is required.",
  intent: "repository_check",
  goal: "Verify the repository state.",
  constraints: ["Do not modify files."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "The check requires one explicit step.",
}

const completedDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The repository state is verified.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The completion criterion has evidence.",
}

const plan: StructuredWorkPlanDecision = {
  workId: "work-1",
  runId: "run-1",
  ownerAgentName: "마당쇠",
  classification: "simple",
  requestReceiptId: "request-receipt-1",
  solutionPlanReceiptId: "solution-plan-receipt-1",
  requestIntent: requestDiagnosis.intent,
  missingInformation: [...requestDiagnosis.missing_information],
  clarificationRequired: false,
  requestAction: "plan",
  lifecycleStates: ["received", "diagnosis_pending", "diagnosed", "route_selected"],
  steps: [
    {
      step_id: "check",
      owner_agent_name: "마당쇠",
      action_type: "validate",
      input_refs: ["request:1"],
      expected_output: "A repository status reference.",
      completion_criteria: "The status reference has validation evidence.",
      status: "pending",
    },
  ],
}

const completedStepResults: WorkStepResult[] = [
  {
    step_id: "check",
    status: "completed",
    output_ref: "result:check",
    evidence_refs: ["test:check"],
  },
]

const failure: FailureDiagnosis = {
  failed_step_id: "check",
  failure_reason: "The selected tool was unavailable.",
  failed_input_refs: ["request:1"],
  failed_strategy: "primary-tool",
  recoverable: true,
}
const recovery: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "fallback-tool",
  expected_benefit: "Uses an available tool.",
  risk: "low",
  changed_dimensions: ["tool"],
}
const failedDiagnosis: LlmResultDiagnosisRecord = {
  ...completedDiagnosis,
  diagnosis_summary: "The failed step is recoverable with a changed tool.",
  sufficiency: "insufficient",
  recommended_action: "retry",
  reason: "A changed tool is available within the retry budget.",
}

function completedInput() {
  return {
    plan,
    source: "user" as const,
    status: "completed" as const,
    userRequestSummary: "Verify the repository state.",
    requestDiagnosis,
    stepResults: completedStepResults,
    resultDiagnosis: completedDiagnosis,
    actionDecision: {
      selected_action: "final_report" as const,
      reason: "Verified evidence satisfies the goal.",
    },
    retryCount: 0,
    retryLimit: 2,
    terminationCondition: "All required steps satisfy their completion criteria.",
  }
}

describe("task1218 canonical work-record assembly", () => {
  it("assembles every required field into a canonically validated completed record", () => {
    const record = assembleCanonicalWorkRecord(completedInput())
    expect(record).toMatchObject({
      schemaVersion: 1,
      work_id: "work-1",
      owner_agent_name: "마당쇠",
      status: "completed",
      stop_condition: "All required steps satisfy their completion criteria.",
      request_diagnosis: { goal: "Verify the repository state." },
      result_diagnosis: { sufficiency: "sufficient", recommended_action: "final_report" },
      step_plan: [
        { step_id: "check", completion_criteria: "The status reference has validation evidence." },
      ],
      step_results: [
        { step_id: "check", output_ref: "result:check", evidence_refs: ["test:check"] },
      ],
      action_decision: { selected_action: "final_report" },
    })
    expect(record.step_plan[0]?.status).toBe("completed")
    expect(validateWorkRecord(record).ok).toBe(true)
  })

  it("assembles a failed record only with an atomic failure and recovery bundle", () => {
    const record = assembleCanonicalWorkRecord({
      ...completedInput(),
      status: "failed",
      stepResults: [{ ...completedStepResults[0]!, status: "failed", error: "tool_unavailable" }],
      resultDiagnosis: failedDiagnosis,
      actionDecision: {
        selected_action: "retry",
        reason: "Retry with the reviewed fallback tool.",
        next_step_id: "check",
      },
      failureBundle: {
        failureDiagnosis: failure,
        recoveryCandidates: [recovery],
        selectedRecoveryAction: recovery,
      },
      terminationCondition: "Stop after two failed recovery attempts.",
    })
    expect(record).toMatchObject({
      status: "failed",
      failure_diagnosis: failure,
      recovery_candidates: [recovery],
      selected_recovery_action: recovery,
      retry_count: 0,
      stop_condition: "Stop after two failed recovery attempts.",
    })
    expect(validateWorkRecord(record).ok).toBe(true)
  })

  it("rejects missing goal or termination condition for every status", () => {
    expect(() =>
      assembleCanonicalWorkRecord({
        ...completedInput(),
        requestDiagnosis: { ...requestDiagnosis, goal: " " },
      }),
    ).toThrow(/goal is required/i)
    expect(() =>
      assembleCanonicalWorkRecord({
        ...completedInput(),
        terminationCondition: " ",
      }),
    ).toThrow(/termination condition is required/i)
  })

  it("rejects incomplete or mismatched failure recovery bundles", () => {
    const base = {
      ...completedInput(),
      status: "failed" as const,
      stepResults: [
        { ...completedStepResults[0]!, status: "failed" as const, error: "tool_unavailable" },
      ],
      resultDiagnosis: failedDiagnosis,
      actionDecision: {
        selected_action: "retry" as const,
        reason: "Retry with a changed tool.",
        next_step_id: "check",
      },
    }
    expect(() => assembleCanonicalWorkRecord(base)).toThrow(/failure bundle is required/i)
    expect(() =>
      assembleCanonicalWorkRecord({
        ...base,
        failureBundle: { failureDiagnosis: failure, recoveryCandidates: [recovery] },
      }),
    ).toThrow(/selected recovery action is required/i)
    expect(() =>
      assembleCanonicalWorkRecord({
        ...base,
        failureBundle: {
          failureDiagnosis: failure,
          recoveryCandidates: [recovery],
          selectedRecoveryAction: { ...recovery, changed_input_or_strategy: "different-fallback" },
        },
      }),
    ).toThrow(/canonical work record validation failed/i)
  })

  it.each([
    ["user request summary", { userRequestSummary: "x".repeat(501) }],
    [
      "diagnosis summary",
      { requestDiagnosis: { ...requestDiagnosis, diagnosis_summary: "x".repeat(501) } },
    ],
    [
      "action reason",
      { actionDecision: { selected_action: "final_report" as const, reason: "x".repeat(501) } },
    ],
    ["termination condition", { terminationCondition: "x".repeat(501) }],
  ])("rejects an overlong %s instead of truncating it", (_field, override) => {
    expect(() => assembleCanonicalWorkRecord({ ...completedInput(), ...override })).toThrow(
      /must not exceed 500 characters/i,
    )
  })

  it("rejects a plan/result reference mismatch before canonical validation", () => {
    expect(() =>
      assembleCanonicalWorkRecord({
        ...completedInput(),
        stepResults: [{ ...completedStepResults[0]!, step_id: "unknown" }],
      }),
    ).toThrow(/unknown planned step/i)
  })

  it("keeps assembly independent from adapters and hidden environment state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/work-record-assembly.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(
      /from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/,
    )
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
  })
})
