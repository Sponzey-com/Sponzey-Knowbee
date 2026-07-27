import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { SlackLiveSmokeTarget } from "../packages/core/src/api/server-runtime-context.ts"
import { createSlackLiveSmokeRuntimePorts } from "../packages/core/src/api/slack-live-smoke-runtime.ts"
import type { TypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

const TARGET: SlackLiveSmokeTarget = { channelId: "C150TARGET", userId: "U150ACTOR" }

function run(): RootRun {
  return {
    id: "run-150",
    sessionId: "session-150",
    requestGroupId: "run-150",
    lineageRootRunId: "run-150",
    runScope: "root",
    title: "Slack smoke",
    prompt: "status",
    source: "slack",
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

function events(): TypedObservabilityEvent[] {
  const correlation = {
    requestId: "run-150",
    requestGroupId: "run-150",
    rootRunId: "run-150",
    runId: "run-150",
    workId: "work-150",
  }
  return [
    {
      eventId: "analysis-150",
      kind: "analysis_completed",
      purpose: "product",
      at: 1,
      correlation,
      reasonCode: "diagnosis_accepted",
      summary: "Analysis completed",
    },
    {
      eventId: "evidence-150",
      kind: "evidence_recorded",
      purpose: "field_debug",
      at: 2,
      correlation: { ...correlation, attemptId: "attempt-150", evidenceId: "evidence-150" },
      reasonCode: "attempt_evidence_recorded",
      summary: "Evidence recorded",
    },
    {
      eventId: "review-150",
      kind: "review_completed",
      purpose: "product",
      at: 3,
      correlation: { ...correlation, evidenceId: "evidence-150", reviewId: "review-150" },
      reasonCode: "all_criteria_verified",
      summary: "Review completed",
    },
    {
      eventId: "finalization-150",
      kind: "finalization_completed",
      purpose: "product",
      at: 4,
      correlation: { ...correlation, reviewId: "review-150" },
      reasonCode: "report_delivered",
      summary: "Finalization completed",
    },
  ]
}

describe("Task 150 Slack live smoke runtime", () => {
  it("uses the actual inbound thread for evidence without exposing it", async () => {
    const readEvidence = vi.fn(() => ({
      providerDeliveryReceipted: true,
      targetMatched: true,
      userReportDelivered: true,
    }))
    const ports = createSlackLiveSmokeRuntimePorts({
      target: TARGET,
      startCanonicalRequest: async () => ({
        requestId: "run-150",
        runId: "run-150",
        requestGroupId: "run-150",
        threadTs: "1752740000.000150",
        finished: Promise.resolve(run()),
      }),
      observabilityRepository: { list: () => ({ events: events(), issues: [] }) },
      listTopologyRunsForRootRun: () => [{ id: "topology-150" }],
      readEvidence,
    })
    const started = await ports.startRequest({ request: "status", source: "slack" })
    await expect(ports.observeTerminal({ started })).resolves.toMatchObject({
      terminalStatus: "completed",
      typedTraceStatus: "ready",
      targetMatched: true,
    })
    expect(readEvidence).toHaveBeenCalledWith(expect.objectContaining({ id: "run-150" }), {
      ...TARGET,
      threadTs: "1752740000.000150",
    })
    expect(JSON.stringify(started)).not.toMatch(/C150|U150|175274/u)
  })

  it("returns a bounded timeout observation", async () => {
    const ports = createSlackLiveSmokeRuntimePorts({
      target: TARGET,
      startCanonicalRequest: async () => ({
        requestId: "run-150",
        runId: "run-150",
        requestGroupId: "run-150",
        threadTs: "1752740000.000150",
        finished: new Promise(() => undefined),
      }),
      observabilityRepository: { list: () => ({ events: [], issues: [] }) },
      listTopologyRunsForRootRun: () => [],
      readEvidence: () => ({
        providerDeliveryReceipted: false,
        targetMatched: false,
        userReportDelivered: false,
      }),
      timeoutMs: 1,
    })
    const started = await ports.startRequest({ request: "status", source: "slack" })
    await expect(ports.observeTerminal({ started })).resolves.toMatchObject({
      terminalStatus: "timed_out",
      typedTraceStatus: "unavailable",
    })
  })

  it("wires the active Slack handler without runtime environment reads", () => {
    const source = readFileSync(
      new URL("../packages/core/src/api/server.ts", import.meta.url),
      "utf8",
    )
    expect(source).toMatch(
      /createSlackLiveSmokeRuntimePorts\([\s\S]*getActiveSlackChannel\(\)[\s\S]*acceptLiveSmokeRequest\(/u,
    )
    expect(source).not.toMatch(/process\.env/u)
  })
})
