import { describe, expect, it } from "vitest"
import {
  createLiveSmokeDecisionReceiptReader,
} from "../packages/core/src/channels/live-smoke-decision-receipts.ts"
import type {
  LlmInvocationReceipt,
} from "../packages/core/src/observability/llm-invocation-receipt.ts"

function receipt(
  invocationId: string,
  operationCode: string,
  phase: LlmInvocationReceipt["phase"] = "completed",
  runId = "run:live",
  at = 1,
): LlmInvocationReceipt {
  const stage =
    operationCode === "request_diagnosis" || operationCode.startsWith("task_intake")
      ? "intake"
      : operationCode.startsWith("solution_plan")
        ? "planning"
        : operationCode.startsWith("final_response")
          ? "final_response"
          : "review"
  return {
    schemaVersion: 1,
    invocationId,
    phase,
    at,
    context: {
      runId,
      requestGroupId: runId,
      stage,
      operationCode,
    },
    ...(phase === "started" ? {} : { durationMs: 1 }),
  }
}

describe("live smoke decision receipt reader", () => {
  it("joins request-group intake receipts with run-bound review and final receipts", () => {
    const intake = receipt("joined-intake", "task_intake", "completed", "run:joined", 1)
    const list = (query?: { runId?: string; requestGroupId?: string }) => {
      if (query?.requestGroupId === "run:joined") {
        return [{
          ...intake,
          context: {
            requestGroupId: "run:joined",
            stage: "intake" as const,
            operationCode: "task_intake",
          },
        }]
      }
      if (query?.runId === "run:joined") {
        return [
          receipt("joined-review", "completion_review", "completed", "run:joined", 2),
          receipt("joined-final", "final_response", "completed", "run:joined", 3),
        ]
      }
      return []
    }
    const read = createLiveSmokeDecisionReceiptReader({ list })

    expect(read("run:joined", "run:joined")).toMatchObject({
      requestDiagnosisReceiptId: "llm-invocation:joined-intake",
      solutionPlanReceiptId: "llm-invocation:joined-intake",
      resultReviewReceiptId: "llm-invocation:joined-review",
      finalResponseReceiptId: "llm-invocation:joined-final",
      decisionReceiptOrderValid: true,
    })
  })

  it("projects the current intake-owned diagnosis and plan into one canonical decision cycle", () => {
    const intake = receipt("intake", "task_intake", "completed", "run:live", 1)
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        {
          ...intake,
          context: {
            requestGroupId: "run:live",
            stage: "intake",
            operationCode: "task_intake",
          },
        },
        receipt("review", "completion_review", "completed", "run:live", 2),
        receipt("final", "final_response", "completed", "run:live", 3),
      ],
    })

    expect(read("run:live", "run:live")).toMatchObject({
      requestDiagnosisReceiptId: "llm-invocation:intake",
      solutionPlanReceiptId: "llm-invocation:intake",
      resultReviewReceiptId: "llm-invocation:review",
      finalResponseReceiptId: "llm-invocation:final",
      decisionReceiptOrderValid: true,
    })
  })

  it("joins request-group intake and run-bound review receipts without weakening scope", () => {
    const intake = receipt("intake", "task_intake", "completed", "run:live", 1)
    const read = createLiveSmokeDecisionReceiptReader({
      list: (query) => query?.runId
        ? [
            receipt("review", "completion_review", "completed", "run:live", 2),
            receipt("final", "final_response", "completed", "run:live", 3),
          ]
        : [{
            ...intake,
            context: {
              requestGroupId: "run:live",
              stage: "intake",
              operationCode: "task_intake",
            },
          }],
    })

    expect(read("run:live", "run:live")).toMatchObject({
      requestDiagnosisReceiptId: "llm-invocation:intake",
      solutionPlanReceiptId: "llm-invocation:intake",
      resultReviewReceiptId: "llm-invocation:review",
      finalResponseReceiptId: "llm-invocation:final",
      decisionReceiptOrderValid: true,
    })
  })

  it("recognizes a completed task-intake receipt as a direct-response decision", () => {
    const direct = receipt("direct", "task_intake", "completed", "run:live", 1)
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        {
          ...direct,
          context: {
            requestGroupId: "run:live",
            stage: "intake",
            operationCode: "task_intake",
          },
        },
      ],
    })

    expect(read("run:live", "run:live")).toEqual({
      directResponseReceiptId: "llm-invocation:direct",
      directResponseReceiptValid: true,
      decisionReceiptOrderValid: false,
    })
  })

  it("selects only completed canonical decisions bound to the same run", () => {
    const read = createLiveSmokeDecisionReceiptReader(
      {
        list: () => [
          receipt("diagnosis", "request_diagnosis"),
          receipt("plan", "solution_plan", "completed", "run:live", 2),
          receipt("review", "result_diagnosis", "completed", "run:live", 3),
          receipt("final", "final_response", "completed", "run:live", 4),
          receipt("failed-plan", "solution_plan", "failed"),
          receipt("other-run", "solution_plan", "completed", "run:other"),
          receipt("capability", "capability_selection"),
        ],
      },
      {
        readForRun: (runId) =>
          runId === "run:live"
            ? "receipt:capability-admission:run:live"
            : undefined,
      },
    )

    expect(read("run:live", "run:live")).toEqual({
      requestDiagnosisReceiptId: "llm-invocation:diagnosis",
      solutionPlanReceiptId: "llm-invocation:plan",
      resultReviewReceiptId: "llm-invocation:review",
      finalResponseReceiptId: "llm-invocation:final",
      decisionReceiptOrderValid: true,
      capabilityAdmissionReceiptId:
        "receipt:capability-admission:run:live",
    })
  })

  it("rejects completed decision receipts that cannot form the canonical order", () => {
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        receipt("diagnosis", "request_diagnosis", "completed", "run:live", 1),
        receipt("plan", "solution_plan", "completed", "run:live", 3),
        receipt("review", "result_diagnosis", "completed", "run:live", 2),
        receipt("final", "final_response", "completed", "run:live", 4),
      ],
    })

    expect(read("run:live", "run:live")).toMatchObject({
      decisionReceiptOrderValid: false,
    })
  })

  it("keeps the latest complete cycle when a newer recovery cycle is incomplete", () => {
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        receipt("diagnosis-1", "request_diagnosis", "completed", "run:live", 1),
        receipt("plan-1", "solution_plan", "completed", "run:live", 2),
        receipt("review-1", "result_diagnosis", "completed", "run:live", 3),
        receipt("final-1", "final_response", "completed", "run:live", 4),
        receipt("diagnosis-2", "request_diagnosis", "completed", "run:live", 5),
        receipt("plan-2", "solution_plan", "completed", "run:live", 6),
      ],
    })

    expect(read("run:live", "run:live")).toMatchObject({
      requestDiagnosisReceiptId: "llm-invocation:diagnosis-1",
      solutionPlanReceiptId: "llm-invocation:plan-1",
      resultReviewReceiptId: "llm-invocation:review-1",
      finalResponseReceiptId: "llm-invocation:final-1",
      decisionReceiptOrderValid: true,
    })
  })

  it("selects the newest complete recovery cycle without mixing older receipts", () => {
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        receipt("diagnosis-1", "request_diagnosis", "completed", "run:live", 1),
        receipt("plan-1", "solution_plan", "completed", "run:live", 2),
        receipt("review-1", "result_diagnosis", "completed", "run:live", 3),
        receipt("final-1", "final_response", "completed", "run:live", 4),
        receipt("diagnosis-2", "request_diagnosis", "completed", "run:live", 5),
        receipt("plan-2", "solution_plan_schema_repair", "completed", "run:live", 6),
        receipt("review-2", "schema_repair", "completed", "run:live", 7),
        receipt("final-2", "final_response_repair", "completed", "run:live", 8),
      ],
    })

    expect(read("run:live", "run:live")).toMatchObject({
      requestDiagnosisReceiptId: "llm-invocation:diagnosis-2",
      solutionPlanReceiptId: "llm-invocation:plan-2",
      resultReviewReceiptId: "llm-invocation:review-2",
      finalResponseReceiptId: "llm-invocation:final-2",
      decisionReceiptOrderValid: true,
    })
  })

  it("keeps existing LLM refs when no capability evidence reader is configured", () => {
    const read = createLiveSmokeDecisionReceiptReader({
      list: () => [
        receipt("diagnosis", "request_diagnosis"),
        receipt("plan", "solution_plan"),
        receipt("review", "result_diagnosis"),
      ],
    })
    expect(read("run:live", "run:live")).not.toHaveProperty(
      "capabilityAdmissionReceiptId",
    )
  })

})
