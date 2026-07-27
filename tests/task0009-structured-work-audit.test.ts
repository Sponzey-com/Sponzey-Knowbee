import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  auditRuntimeChildWorkResultProjection,
  auditRuntimeWorkHandoffProjection,
  type ActionDecision,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type RuntimeChildResultReviewSnapshot,
  type WorkStepPlanItem,
} from "../packages/core/src/contracts/index.ts"
import type { ResultReport } from "../packages/core/src/contracts/sub-agent-orchestration.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The parent should delegate this focused task.",
  intent: "runtime_delegation",
  goal: "Delegate a focused task.",
  constraints: ["Keep memory exchange explicit."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "A sub-agent is the correct execution path.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result is sufficient.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The result and evidence are ready for parent review.",
}

const finalAction: ActionDecision = {
  selected_action: "final_report",
  reason: "The child result can be aggregated.",
}

function command() {
  return {
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
        kind: "text" as const,
        description: "Patch summary and verification result.",
        required: true,
        acceptance: {
          requiredEvidenceKinds: ["test_result"],
          artifactRequired: false,
          reasonCodes: ["targeted_test_passed"],
        },
      }],
    },
  }
}

function resultReport(overrides: Partial<ResultReport> = {}): ResultReport {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "sub_session",
      entityId: "sub-session-1",
      owner: { ownerType: "sub_agent", ownerId: "agent:dev" },
      idempotencyKey: "result-report:sub-session-1",
      parent: {
        parentRunId: "parent-run-1",
        parentSessionId: "session-1",
        parentRequestId: "request-1",
      },
    },
    resultReportId: "result-report-1",
    parentRunId: "parent-run-1",
    subSessionId: "sub-session-1",
    source: {
      entityType: "sub_agent",
      entityId: "agent:dev",
      nicknameSnapshot: "개발자",
    },
    status: "completed",
    outputs: [{ outputId: "patch-summary", status: "satisfied", value: "Patch applied." }],
    evidence: [{ evidenceId: "evidence-1", kind: "test_result", sourceRef: "vitest:task0009" }],
    artifacts: [],
    risksOrGaps: [],
    ...overrides,
  }
}

const review: RuntimeChildResultReviewSnapshot = {
  accepted: true,
  status: "completed",
  missingItems: [],
  requiredChanges: [],
  risksOrGaps: [],
  canRetry: false,
}

describe("task0009 structured work audit", () => {
  it("skips handoff audit without blocking runtime when request diagnosis is missing", () => {
    const audit = auditRuntimeWorkHandoffProjection({
      command: command(),
      parentWorkId: "work-parent-1",
      parentStepId: "step-parent-1",
      parentAgentName: "마당쇠",
      targetAgentName: "개발자",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      retryLimit: 2,
    })

    expect(audit.status).toBe("skipped")
    expect(audit.reasonCode).toBe("missing_runtime_diagnosis")
    expect(audit.blocking).toBe(false)
    expect(audit.productLog.enabled).toBe(false)
    expect(audit.fieldDebugLog.reasonCode).toBe("missing_runtime_diagnosis")
  })

  it("records valid child result projections as diagnostic-only audit results", () => {
    const audit = auditRuntimeChildWorkResultProjection({
      resultReport: resultReport(),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis,
      actionDecision: finalAction,
      review,
    })

    expect(audit.status).toBe("valid")
    expect(audit.blocking).toBe(false)
    expect(audit.value?.status).toBe("completed")
    expect(audit.productLog.enabled).toBe(false)
    expect(audit.fieldDebugLog.issueCount).toBe(0)
  })

  it("records invalid projections with validation issue paths for development logs", () => {
    const missingStep: WorkStepPlanItem = {
      step_id: "child-step-1",
      owner_agent_name: "개발자",
      action_type: "delegate",
      input_refs: ["work-parent-1"],
      expected_output: "Patch summary.",
      completion_criteria: "Tests pass.",
      status: "pending",
    }

    const audit = auditRuntimeWorkHandoffProjection({
      command: command(),
      parentWorkId: "work-parent-1",
      parentStepId: "step-parent-1",
      parentAgentName: "마당쇠",
      targetAgentName: "개발자",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      requestDiagnosis,
      retryLimit: 2,
      stepPlan: [missingStep],
      currentStepId: "missing-step",
    })

    expect(audit.status).toBe("invalid")
    expect(audit.reasonCode).toBe("projection_invalid")
    expect(audit.blocking).toBe(false)
    expect(audit.fieldDebugLog.issuePaths).toContain("$.current_step.step_id")
    expect(audit.developmentLog.validationIssues).toContainEqual(expect.objectContaining({
      path: "$.current_step.step_id",
    }))
  })
})
