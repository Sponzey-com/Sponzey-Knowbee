import { describe, expect, it, vi } from "vitest"
import {
  buildCanonicalTopologyAdmissionDescriptor,
  buildCanonicalTopologyResultDescriptor,
  recordCanonicalTopologyAdmission,
  recordCanonicalTopologyResult,
} from "../packages/core/src/runs/canonical-topology-lifecycle.ts"
import { REQUIRED_SOLUTION_PATHS } from "../packages/core/src/contracts/solution-path-exhaustion.ts"

const route = {
  mode: "route" as const,
  reasonCode: "explicit_topology_target" as const,
  featureFlagMode: "enforced" as const,
  topologyId: "topology:test",
  topologyName: "Test",
  topologyVersion: 1,
  topologyVersionId: "version:1",
  compiledTopologySnapshotId: "snapshot:1",
  entryNodeId: "node:entry",
  selectedExecutorId: "agent:research",
  selectedConnectionPath: ["agent:research"],
  availableDirectChildExecutorIds: ["agent:research"],
  explicit: true,
}

function successfulResult() {
  const nodeResultReport = {
    resultReportId: "result:1",
    status: "completed",
    outputs: [{ outputId: "answer", status: "satisfied", value: "sensitive output value" }],
    unmetSuccessCriteriaIds: [],
    risksOrGaps: [],
  }
  return {
    ok: true as const,
    topologyRunId: "topology-run:1",
    topologyId: "topology:test",
    topologyVersion: 1,
    entryNodeId: "node:entry",
    entryNodeName: "Entry",
    finalAnswer: "sensitive final answer",
    nodeResultReport,
    runtimeResult: { nodeResultReport },
    persistence: {},
  } as never
}

function exhaustedResult(options: { evidenceRefs?: string[] } = {}) {
  const exhaustionEvidenceRefs = [
    ...REQUIRED_SOLUTION_PATHS.map(
      (path) => `solution-path-review:${path}:reviewed_unavailable`,
    ),
    "attempt-strategy:plan:goal:topology:plan_executed",
    "attempt-strategy:tool:goal:topology:tool_failed",
  ]
  return {
    ok: false as const,
    reasonCode: "topology_runtime_terminal_stop" as const,
    fallbackSummary: "terminal",
    issues: [],
    runtimeResult: {
      status: "failed",
      nodeResultReport: {
        resultReportId: "result:failed",
        status: "failed",
        outputs: [],
        unmetSuccessCriteriaIds: ["criterion:price"],
        risksOrGaps: [],
      },
      terminalStopDecision: {
        status: "stop_and_report",
        reasonCode: "solution_paths_exhausted",
        reportInput: {
          goalId: "goal:topology",
          reasonCode: "solution_paths_exhausted",
          diagnosisReceiptId: "result-diagnosis:terminal",
          evidenceRefs: options.evidenceRefs ?? exhaustionEvidenceRefs,
          unresolvedItemIds: ["criterion:price"],
          partialResultRefs: [],
          nextActions: ["Retry when a current source is available."],
        },
      },
    },
  } as never
}

function inMemoryDependencies(startRevision = 0) {
  const stored = new Map<
    string,
    {
      workId: string
      kind: string
      evidenceFingerprint: string
      evidenceRefs: string[]
      consumedRevision?: number
    }
  >()
  const transitions: string[] = []
  let revision = startRevision
  return {
    transitions,
    dependencies: {
      issueReceipt: vi.fn(
        (item: {
          receiptId: string
          workId: string
          kind: string
          evidenceFingerprint: string
          evidenceRefs: string[]
        }) => {
          if (stored.has(item.receiptId))
            return { issued: false as const, reasonCode: "receipt_already_exists" }
          stored.set(item.receiptId, { ...item })
          return { issued: true as const }
        },
      ),
      loadReceipt: vi.fn((receiptId: string) => stored.get(receiptId)),
      applyTransition: vi.fn(
        (input: { receiptRef: string; expectedRevision: number; event: string }) => {
          if (input.expectedRevision !== revision) {
            return { status: "rejected", reasonCode: "stale_revision" }
          }
          transitions.push(`${input.expectedRevision}:${input.event}`)
          const item = stored.get(input.receiptRef)
          if (item) item.consumedRevision = input.expectedRevision + 1
          revision += 1
          return { status: "applied" }
        },
      ),
    },
  }
}

describe("canonical topology lifecycle", () => {
  it("admits topology diagnosis, policy, and execution in order", () => {
    const built = buildCanonicalTopologyAdmissionDescriptor({
      runId: "run:topology",
      route,
      requestDiagnosisReceiptId: "diagnosis:run:topology",
      solutionPlanReceiptId: "solution-plan:run:topology",
      cancellationTokenId: "root-run:run:topology",
      signalAborted: false,
    })
    if (!built.ok) throw new Error(built.reasonCode)
    const runtime = inMemoryDependencies()
    expect(recordCanonicalTopologyAdmission(built.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(runtime.transitions).toEqual([
      "0:DIAGNOSIS_ACCEPTED",
      "1:POLICY_ALLOWED",
      "2:EXECUTION_STARTED",
    ])
    expect(recordCanonicalTopologyAdmission(built.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(runtime.transitions).toHaveLength(3)
    expect(JSON.stringify(built.descriptor)).toContain("diagnosis:run:topology")
    expect(JSON.stringify(built.descriptor)).toContain("solution-plan:run:topology")
    expect(JSON.stringify(built.descriptor)).not.toContain("raw plan")
  })

  it("rejects topology admission without both LLM planning receipt references", () => {
    expect(
      buildCanonicalTopologyAdmissionDescriptor({
        runId: "run:topology",
        route,
        requestDiagnosisReceiptId: "diagnosis:run:topology",
        solutionPlanReceiptId: " ",
        cancellationTokenId: "root-run:run:topology",
        signalAborted: false,
      }),
    ).toEqual({ ok: false, reasonCode: "topology_planning_receipt_invalid" })
  })

  it("keeps exact planning receipt replay idempotent and rejects a changed binding", () => {
    const first = buildCanonicalTopologyAdmissionDescriptor({
      runId: "run:topology",
      route,
      requestDiagnosisReceiptId: "diagnosis:run:topology",
      solutionPlanReceiptId: "solution-plan:run:topology",
      cancellationTokenId: "root-run:run:topology",
      signalAborted: false,
    })
    if (!first.ok) throw new Error(first.reasonCode)
    const runtime = inMemoryDependencies()
    expect(recordCanonicalTopologyAdmission(first.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(recordCanonicalTopologyAdmission(first.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })

    const changed = buildCanonicalTopologyAdmissionDescriptor({
      runId: "run:topology",
      route,
      requestDiagnosisReceiptId: "diagnosis:run:topology",
      solutionPlanReceiptId: "solution-plan:changed",
      cancellationTokenId: "root-run:run:topology",
      signalAborted: false,
    })
    if (!changed.ok) throw new Error(changed.reasonCode)
    expect(recordCanonicalTopologyAdmission(changed.descriptor, runtime.dependencies)).toEqual({
      ok: false,
      reasonCode: "receipt_already_exists",
    })
    expect(runtime.transitions).toHaveLength(3)
  })

  it("records attempt and all-criteria verification without raw output", () => {
    const built = buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: successfulResult(),
      resultDiagnosisReceiptId: "result-diagnosis:run:topology",
    })
    if (!built.ok) throw new Error(built.reasonCode)
    expect(JSON.stringify(built.descriptor)).not.toContain("sensitive final answer")
    expect(JSON.stringify(built.descriptor)).not.toContain("sensitive output value")
    expect(JSON.stringify(built.descriptor)).toContain("result-diagnosis:run:topology")
    const runtime = inMemoryDependencies(3)
    expect(recordCanonicalTopologyResult(built.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(runtime.transitions).toEqual(["3:ATTEMPT_RECORDED", "4:ALL_CRITERIA_VERIFIED"])
    expect(recordCanonicalTopologyResult(built.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(runtime.transitions).toHaveLength(2)
  })

  it("rejects a successful transport result with no verified completion evidence", () => {
    const result = successfulResult() as {
      nodeResultReport: { outputs: unknown[]; unmetSuccessCriteriaIds: string[]; status: string }
    }
    result.nodeResultReport.outputs = []
    expect(
      buildCanonicalTopologyResultDescriptor({
        runId: "run:topology",
        result: result as never,
        resultDiagnosisReceiptId: "result-diagnosis:run:topology",
      }),
    ).toEqual({ ok: false, reasonCode: "topology_result_has_no_verified_evidence" })
  })

  it("rejects canonical verification without a result-diagnosis receipt", () => {
    expect(
      buildCanonicalTopologyResultDescriptor({
        runId: "run:topology",
        result: successfulResult(),
        resultDiagnosisReceiptId: " ",
      }),
    ).toEqual({ ok: false, reasonCode: "topology_result_diagnosis_receipt_invalid" })
  })


  it("records an evidence-bound terminal exhaustion after the failed attempt", () => {
    const built = buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: exhaustedResult(),
      resultDiagnosisReceiptId: "result-diagnosis:terminal",
    })
    if (!built.ok) throw new Error(built.reasonCode)
    expect(built.descriptor.finalOutcome).toBe("exhausted")
    const runtime = inMemoryDependencies(3)
    expect(recordCanonicalTopologyResult(built.descriptor, runtime.dependencies)).toEqual({
      ok: true,
    })
    expect(runtime.transitions).toEqual(["3:ATTEMPT_RECORDED", "4:PATHS_EXHAUSTED"])
  })

  it("rejects terminal exhaustion with a mismatched diagnosis receipt or missing evidence", () => {
    expect(buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: exhaustedResult(),
      resultDiagnosisReceiptId: "result-diagnosis:different",
    })).toEqual({ ok: false, reasonCode: "topology_terminal_diagnosis_receipt_invalid" })

    expect(buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: exhaustedResult({ evidenceRefs: [] }),
      resultDiagnosisReceiptId: "result-diagnosis:terminal",
    })).toEqual({ ok: false, reasonCode: "topology_terminal_evidence_invalid" })
  })

  it("rejects terminal exhaustion without every reviewed path or a distinct attempted strategy", () => {
    expect(buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: exhaustedResult({
        evidenceRefs: [
          ...REQUIRED_SOLUTION_PATHS.slice(0, -1).map(
            (path) => `solution-path-review:${path}:reviewed_unavailable`,
          ),
          "attempt-strategy:tool:goal:topology:tool_failed",
        ],
      }),
      resultDiagnosisReceiptId: "result-diagnosis:terminal",
    })).toEqual({ ok: false, reasonCode: "topology_terminal_paths_incomplete" })

    expect(buildCanonicalTopologyResultDescriptor({
      runId: "run:topology",
      result: exhaustedResult({
        evidenceRefs: REQUIRED_SOLUTION_PATHS.map(
          (path) => `solution-path-review:${path}:reviewed_unavailable`,
        ),
      }),
      resultDiagnosisReceiptId: "result-diagnosis:terminal",
    })).toEqual({ ok: false, reasonCode: "topology_terminal_attempt_evidence_missing" })
  })
})
