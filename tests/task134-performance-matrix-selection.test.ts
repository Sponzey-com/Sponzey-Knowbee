import { describe, expect, it } from "vitest"

import { activatePerformanceAcceptanceMatrix } from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import {
  type PerformanceAcceptanceAuthorizationRecord,
  type PerformanceAcceptanceAuthorizationRepository,
  authorizePerformanceAcceptanceMatrix,
  selectPerformanceAcceptanceMatrix,
} from "../packages/core/src/release/performance-acceptance-authorization.ts"

const threshold = {
  maxLatencyRegressionRatio: 2,
  maxLlmCallIncrease: 1,
  maxAttemptIncrease: 1,
}

function candidate() {
  const baselineVersion = "performance-baseline:v1"
  return {
    schemaVersion: 1 as const,
    matrixId: "performance-matrix:task134",
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1 as const,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 1,
        attemptCount: 1,
      })),
    },
    thresholds: {
      direct_answer: { ...threshold },
      current_fact_read: { ...threshold },
      tool_write: { ...threshold },
      child_delegation: { ...threshold },
      cancel: { ...threshold },
    },
  }
}

function repository(): PerformanceAcceptanceAuthorizationRepository & {
  records: PerformanceAcceptanceAuthorizationRecord[]
} {
  const records: PerformanceAcceptanceAuthorizationRecord[] = []
  return {
    records,
    append(record) {
      records.push(structuredClone(record))
      return { status: "stored" }
    },
    findLatest(binding) {
      return records
        .filter(
          (record) =>
            record.scope === binding.scope &&
            record.matrixId === binding.matrixId &&
            record.matrixVersion === binding.matrixVersion &&
            record.baselineVersion === binding.baselineVersion,
        )
        .at(-1)
    },
  }
}

function record(
  store: PerformanceAcceptanceAuthorizationRepository,
  decision: "approved" | "denied" | "revoked",
) {
  return authorizePerformanceAcceptanceMatrix({
    candidate: candidate(),
    decision,
    principal: {
      principalType: "authenticated_user",
      principalId: "administrator:task134",
      authenticationId: "authentication:task134",
      roles: ["release_administrator"],
    },
    authorizationId: `performance-authorization:task134:${decision}`,
    decidedAt: decision === "approved" ? 100 : 101,
    repository: store,
  })
}

function selector() {
  const matrix = candidate()
  return {
    matrixId: matrix.matrixId,
    matrixVersion: matrix.matrixVersion,
    baselineVersion: matrix.baselineVersion,
  }
}

describe("task134 performance matrix selection", () => {
  it("selects only an exact latest approved matrix", () => {
    const store = repository()
    record(store, "approved")

    const selected = selectPerformanceAcceptanceMatrix({ selector: selector(), repository: store })
    expect(selected).toMatchObject({
      status: "selected",
      candidate: selector(),
    })
    if (selected.status !== "selected") throw new Error("approved matrix must be selected")
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate: selected.candidate,
        authorizationPort: selected.authorizationPort,
      }),
    ).toMatchObject({ status: "active" })

    expect(
      selectPerformanceAcceptanceMatrix({
        selector: { ...selector(), baselineVersion: "performance-baseline:v2" },
        repository: store,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["performance_matrix_selection_missing"] })
  })

  it("does not fall back after denial or revocation", () => {
    for (const decision of ["denied", "revoked"] as const) {
      const store = repository()
      record(store, "approved")
      record(store, decision)
      expect(
        selectPerformanceAcceptanceMatrix({ selector: selector(), repository: store }),
      ).toEqual({
        status: "baseline_only",
        reasonCodes: ["performance_matrix_selection_not_approved"],
      })
    }
  })

  it("fails closed for invalid selectors, repository errors, and malformed snapshots", () => {
    const store = repository()
    record(store, "approved")
    const stored = store.records[0]
    if (!stored) throw new Error("authorization record is required")

    expect(
      selectPerformanceAcceptanceMatrix({
        selector: { ...selector(), matrixVersion: 0 },
        repository: store,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["performance_matrix_selector_invalid"] })
    expect(
      selectPerformanceAcceptanceMatrix({
        selector: selector(),
        repository: {
          append: store.append,
          findLatest: () => {
            throw new Error("read failed")
          },
        },
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_unavailable"],
    })
    expect(
      selectPerformanceAcceptanceMatrix({
        selector: selector(),
        repository: {
          append: store.append,
          findLatest: () => ({ ...stored, thresholdSnapshot: {} }),
        },
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_record_invalid"],
    })
  })
})
