import { describe, expect, it } from "vitest"
import {
  buildCandidateDecisionAuditDetails,
  createExplicitIdProvider,
  createStoreCandidateProvider,
  createStructuredKeyProvider,
  decideCandidateFinal,
  runCandidateProviders,
  type CandidateSearchInput,
} from "../packages/core/src/candidates/index.ts"

interface CandidatePayload {
  id: string
  label: string
}

describe("task007 candidate provider boundary", () => {
  it("runs explicit id as a fast path and skips store providers", async () => {
    let storeCalled = false
    const explicit = createExplicitIdProvider<CandidateSearchInput, CandidatePayload>({
      id: "explicit-run",
      candidateKind: "run",
      ids: (input) => [input.explicitIds?.runId],
      resolve: (id) => id === "run-1" ? { id, label: "active run" } : undefined,
      candidateId: (payload) => payload.id,
    })
    const store = createStoreCandidateProvider<CandidateSearchInput, CandidatePayload>({
      id: "run-store",
      source: "run_store",
      candidateKind: "run",
      candidateReason: "run_contract_projection",
      find: () => {
        storeCalled = true
        return [{ id: "run-store-1", label: "store run" }]
      },
      candidateId: (payload) => payload.id,
    })
    const result = await runCandidateProviders({
      explicitIds: { runId: "run-1" },
    }, [store, explicit], {
      providerTimeoutMs: 20,
      skipSlowOnFastPath: true,
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.source).toBe("explicit_id")
    expect(result.candidates[0]?.requiresFinalDecision).toBe(false)
    expect(storeCalled).toBe(false)
    expect(result.skippedSlowProviders).toBe(true)
    expect(result.traces.filter((trace) => trace.skipped).map((trace) => trace.providerId)).toEqual(["run-store"])
  })

  it("uses structured keys as an explicit contract path", async () => {
    const structured = createStructuredKeyProvider<CandidateSearchInput, CandidatePayload>({
      id: "schedule-key",
      candidateKind: "schedule",
      keys: (input) => [
        { key: "schedule.identity", value: input.structuredKeys?.identityKey },
      ],
      resolve: (_key, value) => value === "identity:daily-weather"
        ? { id: "schedule-1", label: "daily weather" }
        : undefined,
      candidateId: (payload) => payload.id,
    })
    const result = await runCandidateProviders({
      structuredKeys: { identityKey: "identity:daily-weather" },
    }, [structured], {
      providerTimeoutMs: 20,
      skipSlowOnFastPath: true,
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.candidateReason).toBe("structured_key")
    expect(result.candidates[0]?.source).toBe("structured_key")
  })

  it("returns store candidates with stable provider source and reason", async () => {
    const store = createStoreCandidateProvider<CandidateSearchInput, CandidatePayload>({
      id: "schedule-store",
      source: "schedule_store",
      candidateKind: "schedule",
      candidateReason: "schedule_identity_key",
      find: () => [{ id: "schedule-1", label: "morning weather" }],
      candidateId: (payload) => payload.id,
      matchedKeys: (payload) => [`identity:${payload.id}`],
      requiresFinalDecision: true,
    })

    const result = await runCandidateProviders({ limit: 5 }, [store])

    expect(result.candidates).toEqual([
      {
        candidateId: "schedule-1",
        candidateKind: "schedule",
        candidateReason: "schedule_identity_key",
        source: "schedule_store",
        payload: { id: "schedule-1", label: "morning weather" },
        matchedKeys: ["identity:schedule-1"],
        requiresFinalDecision: true,
      },
    ])
  })

  it("keeps candidate source and final decision source separate in audit details", async () => {
    const explicit = createExplicitIdProvider<CandidateSearchInput, CandidatePayload>({
      id: "explicit-artifact",
      candidateKind: "artifact",
      ids: (input) => [input.explicitIds?.artifactId],
      resolve: (id) => id === "artifact-1" ? { id, label: "capture artifact" } : undefined,
    })
    const result = await runCandidateProviders({
      explicitIds: { artifactId: "artifact-1" },
    }, [explicit], {
      skipSlowOnFastPath: false,
    })
    const candidate = result.candidates[0]
    expect(candidate).toBeDefined()

    const decision = decideCandidateFinal({
      requested: "same",
      candidate,
      finalDecisionSource: "explicit_id",
    })
    const audit = buildCandidateDecisionAuditDetails({ candidates: result.candidates, decision })

    expect(audit).toEqual({
      candidateSources: ["explicit_id"],
      candidateReasons: ["explicit_id"],
      finalDecisionSource: "explicit_id",
      finalDecisionKind: "same",
      selectedCandidateId: "artifact-1",
      selectedCandidateSource: "explicit_id",
      selectedCandidateReason: "explicit_id",
    })
  })
})
