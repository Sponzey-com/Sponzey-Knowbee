import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  createLlmDiagnosisReceipt,
  createLlmSolutionPlanReceipt,
  decideLlmDiagnosedActionFlowAcceptance,
  planStructuredWorkLifecycle,
  projectStructuredWorkLifecycle,
} from "../packages/core/src/contracts/index.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import { recordDiagnosedActionFlowAcceptanceSafely } from "../packages/core/src/orchestration/structured-work-audit-ledger.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1281-flow-ledger-"))
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("task1281 diagnosed action flow runtime ledger", () => {
  it("accepts real diagnosis receipts and lifecycle output, then records only structured references", () => {
    const requestPayload = { requestRef: "raw:user:1" }
    const requestDiagnosis: LlmRequestDiagnosisRecord = {
      diagnosis_summary: "A status check needs one tool call.",
      intent: "check_status",
      goal: "Return verified status.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "use_tool",
      reason: "A tool result is required.",
    }
    const requestReceipt = createLlmDiagnosisReceipt({
      receiptId: "receipt:req:1",
      target: "request_diagnosis",
      subjectKind: "user_request",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
    })
    const plan = planStructuredWorkLifecycle({
      workId: "work-1",
      runId: "run-1",
      ownerAgentName: "마당쇠",
      subjectPayload: requestPayload,
      diagnosis: requestDiagnosis,
      receipt: requestReceipt,
      requestDiagnosisIssuedAt: 100,
      solutionPlanReceipt: createLlmSolutionPlanReceipt({
        receiptId: "receipt:plan:1",
        workId: "work-1",
        runId: "run-1",
        requestDiagnosisReceiptId: requestReceipt.receiptId,
        requestDiagnosisIssuedAt: 100,
        issuedAt: 101,
        plan: {
          ownerAgentName: "마당쇠",
          steps: [
            {
              step_id: "step-1",
              owner_agent_name: "마당쇠",
              action_type: "use_tool",
              input_refs: ["raw:user:1"],
              expected_output: "Verified status.",
              completion_criteria: "Status has evidence.",
              status: "pending",
            },
          ],
        },
      }),
      complexity: {
        toolCount: 1,
        subAgentCount: 0,
        usesYeonjang: false,
        requiresApproval: false,
        changesFiles: false,
        longRunning: false,
      },
      proposedSteps: [
        {
          step_id: "step-1",
          owner_agent_name: "마당쇠",
          action_type: "use_tool",
          input_refs: ["raw:user:1"],
          expected_output: "Verified status.",
          completion_criteria: "Status has evidence.",
          status: "pending",
        },
      ],
    })
    const resultPayload = { outputRef: "result:status", evidenceRef: "evidence:status" }
    const resultDiagnosis: LlmResultDiagnosisRecord = {
      diagnosis_summary: "The status result is sufficient.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The result is verified.",
    }
    const resultReceipt = createLlmDiagnosisReceipt({
      receiptId: "receipt:result:1",
      target: "result_diagnosis",
      subjectKind: "tool_result",
      subjectPayload: resultPayload,
      diagnosis: resultDiagnosis,
    })
    const projection = projectStructuredWorkLifecycle({
      plan,
      stepResults: [
        { stepId: "step-1", outputRef: "result:status", evidenceRefs: ["evidence:status"] },
      ],
      resultSubjectPayload: resultPayload,
      resultDiagnosis,
      resultReceipt,
    })
    const acceptance = decideLlmDiagnosedActionFlowAcceptance({
      workId: "work-1",
      runId: "run-1",
      requestDiagnosis: { workId: "work-1", runId: "run-1", receipt: requestReceipt },
      resultDiagnosis: { workId: "work-1", runId: "run-1", receipt: resultReceipt },
      plan,
      projection,
      selectedAction: "final_report",
      rawInputRefs: ["raw:user:1"],
      rawResultRefs: ["result:status"],
    })

    expect(acceptance.status).toBe("accepted")
    expect(
      recordDiagnosedActionFlowAcceptanceSafely({
        acceptance,
        source: "task1281-test",
        dedupeKey: "task1281:run-1:work-1",
        agentId: "agent:knowbee",
      }),
    ).toEqual({ recorded: true })

    const event = listOrchestrationEventLedger({
      runId: "run-1",
      eventKind: "structured_work_audit",
    })[0]
    expect(event).toMatchObject({ severity: "debug", source: "task1281-test" })
    expect(event?.payload).toMatchObject({
      stage: "diagnosed_action_flow",
      workId: "work-1",
      status: "accepted",
      requestReceiptId: "receipt:req:1",
      resultReceiptId: "receipt:result:1",
      selectedAction: "final_report",
    })
    expect(JSON.stringify(event?.payload)).not.toContain("raw:user:1")
    expect(JSON.stringify(event?.payload)).not.toContain("result:status")
  })
})
