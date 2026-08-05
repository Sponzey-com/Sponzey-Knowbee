import { describe, expect, it } from "vitest"

import type { LivePerformanceEvidenceSource } from "../packages/core/src/maintenance/live-performance-evidence.ts"
import type { PerformanceAcceptanceMatrixCandidate } from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import { collectLivePerformanceAcceptanceEvidence } from "../packages/core/src/release/live-performance-acceptance-collection.ts"
import {
  type PerformanceAcceptanceAuthorizationRecord,
  type PerformanceAcceptanceAuthorizationRepository,
  authorizePerformanceAcceptanceMatrix,
} from "../packages/core/src/release/performance-acceptance-authorization.ts"

function matrix(): PerformanceAcceptanceMatrixCandidate {
  const baselineVersion = "performance-baseline:task137:v1"
  const threshold = {
    maxLatencyRegressionRatio: 2,
    maxLlmCallIncrease: 0,
    maxAttemptIncrease: 0,
  }
  return {
    schemaVersion: 1,
    matrixId: "performance-matrix:task137",
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 0,
        attemptCount: 1,
      })),
    },
    thresholds: Object.fromEntries(
      REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [flowId, { ...threshold }]),
    ),
  }
}

function repository(approved = true): PerformanceAcceptanceAuthorizationRepository {
  const records: PerformanceAcceptanceAuthorizationRecord[] = []
  const store: PerformanceAcceptanceAuthorizationRepository = {
    append(record) {
      records.push(structuredClone(record))
      return { status: "stored" }
    },
    findLatest(binding) {
      return records
        .filter(
          (record) =>
            record.matrixId === binding.matrixId &&
            record.matrixVersion === binding.matrixVersion &&
            record.baselineVersion === binding.baselineVersion,
        )
        .at(-1)
    },
  }
  if (approved) {
    authorizePerformanceAcceptanceMatrix({
      candidate: matrix(),
      decision: "approved",
      principal: {
        principalType: "authenticated_user",
        principalId: "administrator:task137",
        authenticationId: "authentication:task137",
        roles: ["release_administrator"],
      },
      authorizationId: "performance-authorization:task137",
      decidedAt: 100,
      repository: store,
    })
  }
  return store
}

const selector = () => ({
  matrixId: matrix().matrixId,
  matrixVersion: matrix().matrixVersion,
  baselineVersion: matrix().baselineVersion,
})
const runs = () =>
  REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({ flowId, runId: `run:${flowId}` }))

function source(statusByRun: Record<string, string> = {}): LivePerformanceEvidenceSource {
  return {
    read(runId) {
      return {
        status: "ready",
        records: {
          run: {
            status: statusByRun[runId] ?? "completed",
            startedAt: 100,
            finishedAt: 220,
          },
          llmReceipts: [],
          events: [{ eventKind: "typed_observability:execution_started", payloadBytes: 10 }],
          queueTransitions: [],
        },
      }
    },
  }
}

describe("task137 live performance acceptance collection", () => {
  it("collects exactly five explicit completed runs against the approved snapshot", () => {
    expect(
      collectLivePerformanceAcceptanceEvidence({
        selector: selector(),
        repository: repository(),
        source: source(),
        runs: runs(),
      }),
    ).toEqual({
      status: "accepted",
      matrixId: matrix().matrixId,
      matrixVersion: 1,
      baselineVersion: matrix().baselineVersion,
      authorizationId: "performance-authorization:task137",
      reasonCodes: [],
    })
  })

  it.each([
    ["missing flow", runs().slice(1), "performance_flow_missing:direct_answer"],
    [
      "duplicate flow",
      [...runs(), { flowId: "direct_answer" as const, runId: "run:other" }],
      "performance_flow_duplicate:direct_answer",
    ],
    [
      "duplicate run",
      runs().map((run) => (run.flowId === "cancel" ? { ...run, runId: "run:direct_answer" } : run)),
      "performance_run_duplicate:run:direct_answer",
    ],
  ])("rejects %s before collection", (_name, selectedRuns, reasonCode) => {
    expect(
      collectLivePerformanceAcceptanceEvidence({
        selector: selector(),
        repository: repository(),
        source: source(),
        runs: selectedRuns,
      }),
    ).toMatchObject({ status: "baseline_only", reasonCodes: [reasonCode] })
  })

  it("rejects an unapproved matrix and an incomplete selected run", () => {
    expect(
      collectLivePerformanceAcceptanceEvidence({
        selector: selector(),
        repository: repository(false),
        source: source(),
        runs: runs(),
      }),
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_missing"],
    })
    expect(
      collectLivePerformanceAcceptanceEvidence({
        selector: selector(),
        repository: repository(),
        source: source({ "run:cancel": "running" }),
        runs: runs(),
      }),
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["flow:cancel:collection:run_not_completed"],
    })
  })
})
