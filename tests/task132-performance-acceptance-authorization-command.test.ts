import { describe, expect, it } from "vitest"

import {
  type PerformanceAcceptanceMatrixCandidate,
  activatePerformanceAcceptanceMatrix,
} from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import {
  type PerformanceAcceptanceAuthorizationRecord,
  type PerformanceAcceptanceAuthorizationRepository,
  authorizePerformanceAcceptanceMatrix,
  createPerformanceAcceptanceAuthorizationPort,
} from "../packages/core/src/release/performance-acceptance-authorization.ts"

const thresholds = {
  maxLatencyRegressionRatio: 2,
  maxLlmCallIncrease: 1,
  maxAttemptIncrease: 1,
}

function matrix(): PerformanceAcceptanceMatrixCandidate {
  const baselineVersion = "performance-baseline:v1"
  return {
    schemaVersion: 1,
    matrixId: "performance-matrix:task132",
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 1,
        attemptCount: 1,
      })),
    },
    thresholds: {
      direct_answer: { ...thresholds },
      current_fact_read: { ...thresholds },
      tool_write: { ...thresholds },
      child_delegation: { ...thresholds },
      cancel: { ...thresholds },
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
      if (records.some((candidate) => candidate.authorizationId === record.authorizationId)) {
        return { status: "duplicate_id" }
      }
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

function authorize(input: {
  repository: PerformanceAcceptanceAuthorizationRepository
  decision?: PerformanceAcceptanceAuthorizationRecord["decision"]
  authorizationId?: string
  candidate?: PerformanceAcceptanceMatrixCandidate
  principal?: {
    principalType: "authenticated_user" | "system"
    principalId: string
    authenticationId: string
    roles: string[]
  }
}) {
  return authorizePerformanceAcceptanceMatrix({
    candidate: input.candidate ?? matrix(),
    decision: input.decision ?? "approved",
    principal: input.principal ?? {
      principalType: "authenticated_user",
      principalId: "administrator:task132",
      authenticationId: "authentication:task132",
      roles: ["release_administrator"],
    },
    authorizationId: input.authorizationId ?? "authorization:task132",
    decidedAt: 100,
    repository: input.repository,
  })
}

describe("task132 performance acceptance authorization command", () => {
  it("rejects unauthenticated, system, wrong-role, and invalid-matrix commands", () => {
    const store = repository()
    const commands = [
      authorize({
        repository: store,
        principal: {
          principalType: "authenticated_user",
          principalId: "administrator:task132",
          authenticationId: "",
          roles: ["release_administrator"],
        },
      }),
      authorize({
        repository: store,
        principal: {
          principalType: "system",
          principalId: "system:task132",
          authenticationId: "authentication:system",
          roles: ["release_administrator"],
        },
      }),
      authorize({
        repository: store,
        principal: {
          principalType: "authenticated_user",
          principalId: "operator:task132",
          authenticationId: "authentication:operator",
          roles: ["operator"],
        },
      }),
      authorize({
        repository: store,
        candidate: { ...matrix(), thresholds: {} },
      }),
    ]

    expect(commands).toEqual([
      { status: "rejected", reasonCode: "performance_authorization_authentication_required" },
      { status: "rejected", reasonCode: "performance_authorization_principal_invalid" },
      { status: "rejected", reasonCode: "performance_authorization_role_required" },
      expect.objectContaining({
        status: "rejected",
        reasonCode:
          "performance_authorization_candidate_invalid:matrix_required_flow_missing:direct_answer",
      }),
    ])
    expect(store.records).toHaveLength(0)
  })

  it("stores an immutable threshold snapshot and rejects duplicate authorization IDs", () => {
    const store = repository()
    const candidate = matrix()
    const result = authorize({ repository: store, candidate })

    expect(result).toMatchObject({
      status: "recorded",
      record: {
        decision: "approved",
        actorType: "administrator",
        matrixId: candidate.matrixId,
        thresholdSnapshot: candidate.thresholds,
      },
    })
    const currentFactThreshold = candidate.thresholds.current_fact_read
    if (!currentFactThreshold) throw new Error("current_fact_read threshold is required")
    currentFactThreshold.maxLlmCallIncrease = 99
    expect(store.records[0]?.thresholdSnapshot.current_fact_read?.maxLlmCallIncrease).toBe(1)
    expect(authorize({ repository: store })).toEqual({
      status: "rejected",
      reasonCode: "performance_authorization_id_duplicate",
    })
  })

  it("uses only the latest exact decision and rejects a changed threshold snapshot", () => {
    const store = repository()
    authorize({ repository: store, authorizationId: "authorization:approved" })
    const port = createPerformanceAcceptanceAuthorizationPort(store)

    expect(
      activatePerformanceAcceptanceMatrix({ candidate: matrix(), authorizationPort: port }),
    ).toMatchObject({ status: "active" })
    const changed = matrix()
    const changedCurrentFactThreshold = changed.thresholds.current_fact_read
    if (!changedCurrentFactThreshold) throw new Error("current_fact_read threshold is required")
    changedCurrentFactThreshold.maxAttemptIncrease = 2
    expect(
      activatePerformanceAcceptanceMatrix({ candidate: changed, authorizationPort: port }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_authorization_binding_mismatch"],
    })

    authorize({
      repository: store,
      decision: "denied",
      authorizationId: "authorization:denied",
    })
    expect(
      activatePerformanceAcceptanceMatrix({ candidate: matrix(), authorizationPort: port }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_authorization_missing"] })

    authorize({
      repository: store,
      decision: "revoked",
      authorizationId: "authorization:revoked",
    })
    expect(
      activatePerformanceAcceptanceMatrix({ candidate: matrix(), authorizationPort: port }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_authorization_missing"] })
  })

  it("fails closed when a repository returns a malformed threshold snapshot", () => {
    const store = repository()
    authorize({ repository: store })
    const stored = store.records[0]
    if (!stored) throw new Error("authorization record is required")
    const malformed = {
      ...stored,
      thresholdSnapshot: undefined,
    } as unknown as PerformanceAcceptanceAuthorizationRecord
    const port = createPerformanceAcceptanceAuthorizationPort({
      append: store.append,
      findLatest: () => malformed,
    })

    expect(
      activatePerformanceAcceptanceMatrix({ candidate: matrix(), authorizationPort: port }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_authorization_binding_mismatch"],
    })
  })
})
