import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { TelegramLiveSmokeTarget } from "../packages/core/src/api/server-runtime-context.ts"
import { createTelegramLiveSmokeRuntimePorts } from "../packages/core/src/api/telegram-live-smoke-runtime.ts"
import type { TypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

const TARGET: TelegramLiveSmokeTarget = { chatId: -100148, userId: 148, threadId: 7 }
const EXECUTION_OUTCOME = {
  executionStatus: "succeeded" as const,
  deliveryStatus: "delivered" as const,
}

function rootRun(): RootRun {
  return {
    id: "run-148",
    sessionId: "session-148",
    requestGroupId: "run-148",
    lineageRootRunId: "run-148",
    runScope: "root",
    title: "Telegram smoke",
    prompt: "Report current status.",
    source: "telegram",
    status: "completed",
    taskProfile: "general_chat",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 3,
    currentStepKey: "completed",
    currentStepIndex: 8,
    totalSteps: 9,
    summary: "Completed",
    canCancel: false,
    createdAt: 1,
    updatedAt: 9,
    steps: [],
    recentEvents: [],
  }
}

function typedEvents(): TypedObservabilityEvent[] {
  const correlation = {
    requestId: "run-148",
    requestGroupId: "run-148",
    rootRunId: "run-148",
    runId: "run-148",
    workId: "work-148",
  }
  return [
    {
      eventId: "analysis-148",
      kind: "analysis_completed",
      purpose: "product",
      at: 2,
      correlation,
      reasonCode: "diagnosis_accepted",
      summary: "Solution analysis completed",
    },
    {
      eventId: "evidence-148",
      kind: "evidence_recorded",
      purpose: "field_debug",
      at: 3,
      correlation: { ...correlation, attemptId: "attempt-148", evidenceId: "evidence-148" },
      reasonCode: "attempt_evidence_recorded",
      summary: "Execution evidence recorded",
    },
    {
      eventId: "review-148",
      kind: "review_completed",
      purpose: "product",
      at: 4,
      correlation: { ...correlation, evidenceId: "evidence-148", reviewId: "review-148" },
      reasonCode: "all_criteria_verified",
      summary: "Canonical result review completed",
    },
    {
      eventId: "finalization-148",
      kind: "finalization_completed",
      purpose: "product",
      at: 5,
      correlation: { ...correlation, reviewId: "review-148" },
      reasonCode: "report_delivered",
      summary: "User report delivery completed",
    },
  ]
}

describe("Task 148 Telegram live smoke runtime", () => {
  it("observes the run started by the active Telegram inbound handler", async () => {
    const startCanonicalRequest = vi.fn(async () => ({
      requestId: "run-148",
      runId: "run-148",
      requestGroupId: "run-148",
      finished: Promise.resolve(rootRun()),
    }))
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(1_900)
    const ports = createTelegramLiveSmokeRuntimePorts({
      target: TARGET,
      startCanonicalRequest,
      observabilityRepository: {
        list: () => ({ events: typedEvents(), issues: [] }),
      },
      listTopologyRunsForRootRun: () => [{ topologyRunId: "topology-148" }],
      readExecutionOutcome: () => EXECUTION_OUTCOME,
      readDecisionReceiptRefs: () => ({
        requestDiagnosisReceiptId: "receipt:diagnosis:148",
        solutionPlanReceiptId: "receipt:plan:148",
        resultReviewReceiptId: "receipt:review:148",
      }),
      readFirstResponseLatency: () => ({
        metricId: "latency-148",
        runId: "run-148",
        requestGroupId: "run-148",
        durationMs: 300,
        budgetMs: 30_000,
        status: "ok",
      }),
      now,
      readEvidence: () => ({
        providerDeliveryReceipted: true,
        targetMatched: true,
        userReportDelivered: true,
      }),
    })

    const started = await ports.startRequest({
      request: "Report current status.",
      source: "telegram",
    })
    await expect(ports.observeTerminal({ started })).resolves.toMatchObject({
      terminalStatus: "completed",
      typedTraceStatus: "ready",
      topologyRunCount: 1,
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
      executionOutcome: EXECUTION_OUTCOME,
    })
    expect(startCanonicalRequest).toHaveBeenCalledWith({
      request: "Report current status.",
      target: TARGET,
    })
    expect(JSON.stringify(started)).not.toContain(String(TARGET.chatId))
  })

  it("turns a bounded terminal wait into a stable timeout observation", async () => {
    const cancelRun = vi.fn()
    const ports = createTelegramLiveSmokeRuntimePorts({
      target: TARGET,
      startCanonicalRequest: async () => ({
        requestId: "run-148",
        runId: "run-148",
        requestGroupId: "run-148",
        finished: new Promise(() => undefined),
      }),
      observabilityRepository: { list: () => ({ events: [], issues: [] }) },
      listTopologyRunsForRootRun: () => [],
      readExecutionOutcome: () => undefined,
      readDecisionReceiptRefs: () => ({}),
      readFirstResponseLatency: () => undefined,
      readEvidence: () => ({
        providerDeliveryReceipted: false,
        targetMatched: false,
        userReportDelivered: false,
        userReportDeliveryCount: 0,
      }),
      cancelRun,
      timeoutMs: 1,
    })
    const started = await ports.startRequest({ request: "status", source: "telegram" })
    await expect(ports.observeTerminal({ started })).resolves.toMatchObject({
      terminalStatus: "timed_out",
      typedTraceStatus: "unavailable",
    })
    expect(cancelRun).toHaveBeenCalledOnce()
    expect(cancelRun).toHaveBeenCalledWith("run-148")
  })

  it("wires live smoke through the active Telegram channel without runtime env reads", () => {
    const server = readFileSync(
      new URL("../packages/core/src/api/server.ts", import.meta.url),
      "utf8",
    )
    expect(server).toContain("createTelegramLiveSmokeRuntimePorts({")
    expect(server).toMatch(
      /startCanonicalRequest:[\s\S]*getActiveTelegramChannel\(\)[\s\S]*acceptLiveSmokeRequest\(/u,
    )
    expect(server).not.toMatch(/process\.env/u)
  })
})
