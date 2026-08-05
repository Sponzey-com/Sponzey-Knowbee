import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createWebUiLiveSmokeRuntimePorts } from "../packages/core/src/api/webui-live-smoke-runtime.ts"
import { DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS } from "../packages/core/src/channels/live-smoke-terminal-observer.ts"
import type { ChannelSmokeScenario } from "../packages/core/src/channels/smoke-runner.ts"
import { createWebUiLiveSmokeExecutor } from "../packages/core/src/channels/webui-live-smoke-executor.ts"
import type { TypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"
import type { StartedIngressRun } from "../packages/core/src/runs/ingress.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

const SCENARIO: ChannelSmokeScenario = {
  id: "webui.basic_query",
  channel: "webui",
  kind: "basic_query",
  title: "WebUI basic query",
  request: "Report current status.",
  expectedTarget: "webui",
  correlationKey: "webui_run_id",
  requiresExternalCredential: false,
  releaseGate: "automated",
}

const EXECUTION_OUTCOME = {
  executionStatus: "succeeded" as const,
  deliveryStatus: "delivered" as const,
}

function rootRun(): RootRun {
  return {
    id: "run-145",
    sessionId: "session-145",
    requestGroupId: "run-145",
    lineageRootRunId: "run-145",
    runScope: "root",
    title: "Smoke",
    prompt: "Report current status.",
    source: "webui",
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
    requestId: "run-145",
    requestGroupId: "run-145",
    rootRunId: "run-145",
    runId: "run-145",
    workId: "work-145",
  }
  return [
    {
      eventId: "analysis-145",
      kind: "analysis_completed",
      purpose: "product",
      at: 2,
      correlation,
      reasonCode: "diagnosis_accepted",
      summary: "Solution analysis completed",
    },
    {
      eventId: "execution-145",
      kind: "execution_started",
      purpose: "field_debug",
      at: 3,
      correlation: { ...correlation, attemptId: "attempt-145" },
      reasonCode: "execution_started",
      summary: "Execution attempt started",
    },
    {
      eventId: "evidence-145-event",
      kind: "evidence_recorded",
      purpose: "field_debug",
      at: 4,
      correlation: {
        ...correlation,
        attemptId: "attempt-145",
        evidenceId: "evidence-145",
      },
      reasonCode: "attempt_evidence_recorded",
      summary: "Execution evidence recorded",
    },
    {
      eventId: "review-145-event",
      kind: "review_completed",
      purpose: "product",
      at: 5,
      correlation: {
        ...correlation,
        evidenceId: "evidence-145",
        reviewId: "review-145",
      },
      reasonCode: "all_criteria_verified",
      summary: "Canonical result review completed",
    },
    {
      eventId: "finalization-145",
      kind: "finalization_completed",
      purpose: "product",
      at: 6,
      correlation: { ...correlation, reviewId: "review-145" },
      reasonCode: "report_delivered",
      summary: "User report delivery completed",
    },
  ]
}

function ingress(finished: Promise<RootRun | undefined>): StartedIngressRun {
  return {
    requestId: "run-145",
    sessionId: "session-145",
    source: "webui",
    inboundMessage: {} as StartedIngressRun["inboundMessage"],
    acknowledgement: {} as StartedIngressRun["acknowledgement"],
    started: {
      runId: "run-145",
      sessionId: "session-145",
      status: "started",
      finished,
    },
  }
}

describe("Task 145 WebUI live smoke runtime", () => {
  it("keeps the terminal observation budget separate from the 30-second first-response gate", () => {
    expect(DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS).toBe(240_000)
  })

  it("wires the live executor to the same canonical local-run start boundary as WebUI", () => {
    const serverSource = readFileSync(
      new URL("../packages/core/src/api/server.ts", import.meta.url),
      "utf8",
    )
    const runsSource = readFileSync(
      new URL("../packages/core/src/api/routes/runs.ts", import.meta.url),
      "utf8",
    )

    expect(serverSource).toMatch(
      /createWebUiLiveSmokeExecutor\(\s*createWebUiLiveSmokeRuntimePorts\(\{[\s\S]*startCanonicalRequest:[\s\S]*startCanonicalLocalRun\(/u,
    )
    expect(runsSource).toMatch(
      /export async function startLocalRun[\s\S]*const ingress = startCanonicalLocalRun\(params\)/u,
    )
    expect(serverSource).not.toMatch(/process\.env/u)
  })

  it("observes canonical completion, typed receipts, and topology evidence", async () => {
    const startCanonicalRequest = vi.fn(() => ingress(Promise.resolve(rootRun())))
    const readExecutionOutcome = vi.fn(() => EXECUTION_OUTCOME)
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(1_900)
    const ports = createWebUiLiveSmokeRuntimePorts({
      startCanonicalRequest,
      observabilityRepository: {
        list: () => ({ events: typedEvents(), issues: [] }),
      },
      listTopologyRunsForRootRun: () => [{ topologyRunId: "topology-145" }],
      readExecutionOutcome,
      readDecisionReceiptRefs: () => ({
        requestDiagnosisReceiptId: "receipt:diagnosis:145",
        solutionPlanReceiptId: "receipt:plan:145",
        resultReviewReceiptId: "receipt:review:145",
        finalResponseReceiptId: "receipt:final-response:145",
        decisionReceiptOrderValid: true,
      }),
      readFirstResponseLatency: () => ({
        metricId: "latency-145",
        runId: "run-145",
        requestGroupId: "run-145",
        durationMs: 300,
        budgetMs: 30_000,
        status: "ok",
      }),
      now,
      readEvidence: () => ({
        toolReceipts: [],
        approvalReceipts: [],
        artifactReceipts: [],
        capabilityReceipts: [],
        userReportDelivered: true,
        deliveryReceiptRef: "receipt:delivery:145",
      }),
    })

    await expect(createWebUiLiveSmokeExecutor(ports)(SCENARIO)).resolves.toMatchObject({
      requestFlow: {
        runId: "run-145",
        requestGroupId: "run-145",
        decisionTracePresent: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
      auditLogId: "finalization-145",
    })
    expect(startCanonicalRequest).toHaveBeenCalledWith(SCENARIO.request)
    expect(readExecutionOutcome).toHaveBeenCalledWith("run-145")
  })

  it("turns a bounded terminal wait timeout into a stable failure", async () => {
    const cancelRun = vi.fn()
    const ports = createWebUiLiveSmokeRuntimePorts({
      startCanonicalRequest: () => ingress(new Promise(() => undefined)),
      observabilityRepository: {
        list: () => ({ events: [], issues: [] }),
      },
      listTopologyRunsForRootRun: () => [],
      readExecutionOutcome: () => undefined,
      readDecisionReceiptRefs: () => ({}),
      readFirstResponseLatency: () => undefined,
      readEvidence: () => ({
        toolReceipts: [],
        approvalReceipts: [],
        artifactReceipts: [],
        capabilityReceipts: [],
        userReportDelivered: false,
        userReportDeliveryCount: 0,
      }),
      cancelRun,
      timeoutMs: 1,
    })

    await expect(createWebUiLiveSmokeExecutor(ports)(SCENARIO)).rejects.toThrow(
      "webui_live_smoke_terminal_timed_out",
    )
    expect(cancelRun).toHaveBeenCalledOnce()
    expect(cancelRun).toHaveBeenCalledWith("run-145")
  })
})
