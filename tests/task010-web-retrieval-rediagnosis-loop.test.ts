import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  WebRetrievalLiveRunnerError,
  WebRetrievalLivePortError,
  runWebRetrievalLiveScenario,
  type WebRetrievalLiveCandidate,
} from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import type { WebRetrievalLiveSmokeScenario } from "../packages/core/src/runs/web-retrieval-smoke.ts"

const HASH = (character: string) => `sha256:${character.repeat(64)}` as const
const scenario: WebRetrievalLiveSmokeScenario = {
  id: "task010-current-value",
  title: "Current value",
  request: "현재 값을 확인해줘",
  target: { rawQuery: "current value" },
  freshnessPolicy: "strict_timestamp",
  minimumMethods: ["fast_text_search", "direct_fetch"],
  completionConditions: ["current value and source time are verified"],
}

function candidate(suffix: string): WebRetrievalLiveCandidate {
  return {
    evidenceRef: `evidence:${suffix}`,
    sourceUrl: `https://example.com/${suffix}`,
    sourceDomain: "example.com",
    sourceTimestamp: "2026-07-24T04:00:00.000Z",
    fetchedAt: "2026-07-24T04:00:01.000Z",
  }
}

function selected(current: WebRetrievalLiveCandidate) {
  return {
    diagnosedBy: "llm" as const,
    status: "selected" as const,
    contextFingerprint: HASH("a"),
    selectedEvidenceRef: current.evidenceRef,
    selectedSourceUrl: current.sourceUrl,
    requestedTargetFingerprint: HASH("b"),
  }
}

function complete(evidenceRef: string) {
  return {
    diagnosedBy: "llm" as const,
    status: "complete" as const,
    contextFingerprint: HASH("c"),
    criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
    conditionCount: 1,
    evidenceRefs: [evidenceRef],
    targetBinding: {
      status: "verified" as const,
      requestedTargetFingerprint: HASH("b"),
      evidenceTargetFingerprint: HASH("b"),
    },
  }
}

function retry(searchRequest: string, fingerprintCharacter: string) {
  return {
    diagnosedBy: "llm" as const,
    status: "retry" as const,
    contextFingerprint: HASH("d"),
    nextAction: {
      kind: "search" as const,
      searchRequest,
      attemptFingerprint: HASH(fingerprintCharacter),
    },
  }
}

describe("task010 LLM rediagnosis loop", () => {
  it("wires file-backed LLM rediagnosis into the production live executor", () => {
    const adapter = readFileSync(
      "packages/core/src/release/live-acceptance-llm-adapter.ts",
      "utf8",
    )
    const executor = readFileSync(
      "packages/core/src/release/live-acceptance-verified-executor.ts",
      "utf8",
    )
    const prompt = readFileSync("prompts/live_acceptance_evidence.md", "utf8")
    expect(adapter).toContain('"web_rediagnosis"')
    expect(adapter).toContain("webRediagnosis:")
    expect(executor).toContain("rediagnose: webRediagnosis")
    expect(executor).toContain("maxAttempts: 3")
    expect(prompt).toContain("For `web_rediagnosis`")
    expect(prompt).toContain("materially different")
  })

  it("retries a no-results search with a materially changed LLM strategy", async () => {
    const searches: string[] = []
    const current = candidate("current")
    const trace = await runWebRetrievalLiveScenario({
      runId: "run:task010:no-results",
      scenario,
      search: async ({ searchRequest }) => {
        searches.push(searchRequest)
        return searches.length === 1
          ? { candidates: [], auditEventId: "audit:empty", diagnosisPayload: {} }
          : { candidates: [current], auditEventId: "audit:search", diagnosisPayload: {} }
      },
      plan: async () => selected(current),
      fetch: async () => ({
        evidenceRef: "evidence:fetched",
        sourceDomain: "example.com",
        sourceTimestamp: "2026-07-24T04:00:00.000Z",
        fetchedAt: "2026-07-24T04:00:01.000Z",
        auditEventId: "audit:fetch",
        diagnosisPayload: {},
      }),
      diagnose: async ({ evidenceRef }) => complete(evidenceRef),
      rediagnose: async ({ failure }) => {
        expect(failure).toMatchObject({
          stage: "search",
          reasonCode: "web_live_search_evidence_invalid",
        })
        return retry("current value official source", "e")
      },
      maxAttempts: 3,
      signal: new AbortController().signal,
    })

    expect(searches).toEqual(["현재 값을 확인해줘", "current value official source"])
    expect(trace.answerProduced).toBe(true)
  })

  it("preserves a closed provider failure reason for LLM rediagnosis", async () => {
    const current = candidate("rate-limit-recovery")
    let searchCount = 0
    const rediagnose = vi.fn(async ({ failure }) => {
      expect(failure.reasonCode).toBe("web_search_rate_limited")
      return retry("current value alternate public source", "8")
    })
    await expect(
      runWebRetrievalLiveScenario({
        runId: "run:task010:rate-limit",
        scenario,
        search: async () => {
          searchCount += 1
          if (searchCount === 1) {
            throw new WebRetrievalLivePortError("web_search_rate_limited")
          }
          return { candidates: [current], auditEventId: "audit:search", diagnosisPayload: {} }
        },
        plan: async () => selected(current),
        fetch: async () => ({
          evidenceRef: "evidence:fetched",
          sourceDomain: "example.com",
          sourceTimestamp: "2026-07-24T04:00:00.000Z",
          fetchedAt: "2026-07-24T04:00:01.000Z",
          auditEventId: "audit:fetch",
          diagnosisPayload: {},
        }),
        diagnose: async ({ evidenceRef }) => complete(evidenceRef),
        rediagnose,
        maxAttempts: 3,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining({ answerProduced: true }))
    expect(rediagnose).toHaveBeenCalledOnce()
  })

  it("retries when LLM verification reports insufficient evidence", async () => {
    const first = candidate("previous")
    const second = candidate("current")
    let searchCount = 0
    let diagnosisCount = 0
    const rediagnose = vi.fn(async () => retry("current value timestamp official", "f"))
    const trace = await runWebRetrievalLiveScenario({
      runId: "run:task010:stale",
      scenario,
      search: async () => {
        searchCount += 1
        const value = searchCount === 1 ? first : second
        return { candidates: [value], auditEventId: `audit:search:${searchCount}`, diagnosisPayload: {} }
      },
      plan: async ({ candidates }) => selected(candidates[0]),
      fetch: async ({ candidate: value }) => ({
        evidenceRef: `fetched:${value.evidenceRef}`,
        sourceDomain: value.sourceDomain,
        sourceTimestamp: value.sourceTimestamp,
        fetchedAt: value.fetchedAt,
        auditEventId: `audit:fetch:${searchCount}`,
        diagnosisPayload: {},
      }),
      diagnose: async ({ evidenceRef }) => {
        diagnosisCount += 1
        return diagnosisCount === 1
          ? {
              ...complete(evidenceRef),
              status: "followup",
              targetBinding: {
                status: "unverified",
                requestedTargetFingerprint: HASH("b"),
                evidenceTargetFingerprint: HASH("9"),
              },
            }
          : complete(evidenceRef)
      },
      rediagnose,
      maxAttempts: 3,
      signal: new AbortController().signal,
    })

    expect(rediagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({
          stage: "verification",
          reasonCode: "web_live_llm_result_diagnosis_invalid",
        }),
      }),
    )
    expect(trace.answerProduced).toBe(true)
    expect(searchCount).toBe(2)
  })

  it("fails closed when the LLM repeats the same search strategy", async () => {
    await expect(
      runWebRetrievalLiveScenario({
        runId: "run:task010:duplicate",
        scenario,
        search: async () => ({ candidates: [], auditEventId: "audit:empty", diagnosisPayload: {} }),
        plan: vi.fn(),
        fetch: vi.fn(),
        diagnose: vi.fn(),
        rediagnose: async () => retry(scenario.request, "7"),
        maxAttempts: 3,
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining<WebRetrievalLiveRunnerError>({
        code: "web_live_rediagnosis_strategy_duplicate",
      }),
    )
  })

  it("does not rediagnose or call tools after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn()
    const rediagnose = vi.fn()
    await expect(
      runWebRetrievalLiveScenario({
        runId: "run:task010:cancelled",
        scenario,
        search,
        plan: vi.fn(),
        fetch: vi.fn(),
        diagnose: vi.fn(),
        rediagnose,
        maxAttempts: 3,
        signal: controller.signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "web_live_cancelled" }))
    expect(search).not.toHaveBeenCalled()
    expect(rediagnose).not.toHaveBeenCalled()
  })
})
