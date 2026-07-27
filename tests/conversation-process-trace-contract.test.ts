import { describe, expect, it } from "vitest"
import {
  getDefaultChannelSmokeScenarios,
  validateChannelSmokeTrace,
  type ChannelSmokeTrace,
} from "../packages/core/src/channels/smoke-runner.ts"

const scenario = getDefaultChannelSmokeScenarios().find(
  (candidate) => candidate.id === "webui.basic_query",
)!

function legacyTrace(): ChannelSmokeTrace {
  return {
    sourceChannel: "webui",
    responseChannel: "webui",
    correlationKey: "webui_run_id",
    requestFlow: {
      runId: "run:webui:basic",
      requestGroupId: "run:webui:basic",
      requestGroupMatchesRunId: true,
      decisionTracePresent: true,
      topologyRunCreated: true,
      providerDirectUsed: false,
    },
    finalText: "완료했습니다.",
    auditLogId: "audit:webui:basic",
  }
}

describe("conversation process trace contract", () => {
  it("does not treat one broad decision flag as three LLM receipts and final delivery proof", () => {
    const result = validateChannelSmokeTrace(scenario, legacyTrace())

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "request_diagnosis_receipt_missing",
      "solution_plan_receipt_missing",
      "result_review_receipt_missing",
      "root_finalization_missing",
      "final_delivery_receipt_missing",
    ]))
  })

  it("passes a trace with distinct decisions, root finalization, and exact-target delivery", () => {
    const trace: ChannelSmokeTrace = {
      ...legacyTrace(),
      requestFlow: {
        ...legacyTrace().requestFlow!,
        requestDiagnosisReceiptId: "receipt:diagnosis",
        solutionPlanReceiptId: "receipt:plan",
        resultReviewReceiptId: "receipt:review",
        finalResponseReceiptId: "receipt:final-response",
        decisionReceiptOrderValid: true,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      latency: {
        metricId: "latency:webui:basic",
        runId: "run:webui:basic",
        requestGroupId: "run:webui:basic",
        firstResponseLatencyMs: 500,
        firstResponseBudgetMs: 30_000,
        firstResponseStatus: "ok",
        terminalResponseLatencyMs: 800,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: "webui",
        correlationKey: "webui_run_id",
        receiptRef: "receipt:delivery",
        userVisible: true,
      },
    }

    expect(validateChannelSmokeTrace(scenario, trace)).toEqual({
      status: "passed",
      failures: [],
    })
  })
})
