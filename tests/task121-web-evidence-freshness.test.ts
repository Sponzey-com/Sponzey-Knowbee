import { describe, expect, it } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  type CompletionReviewCriterionAssessment,
  buildCompletionReviewFreshnessEvidenceRefs,
  evaluateCompletionReviewCriterionGate,
} from "../packages/core/src/agent/completion-review.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import {
  assessSourceFreshness,
  normalizeSourceTimestamp,
} from "../packages/core/src/runs/web-retrieval-policy.ts"
import { createWebFetchTool } from "../packages/core/src/tools/builtin/web-fetch.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const evidenceRef = `tool-result:web:${"a".repeat(64)}`
const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-task121-freshness")

function completeAssessments(): CompletionReviewCriterionAssessment[] {
  return COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    applicable: true,
    verdict: "satisfied",
    evidenceRefs: [evidenceRef],
    uncertainty: "",
    reason: `${criterionKey} verified`,
  }))
}

describe("task121 web evidence freshness", () => {
  it("classifies old strict-timestamp source evidence as stale", async () => {
    const html = `<!doctype html><html><head><meta property="article:published_time" content="2026-06-26T15:30:12+09:00"></head><body><main><h1>Quote</h1><p>2,673,000.00 KRW</p></main></body></html>`
    const tool = createWebFetchTool({
      resolver: async () => ["93.184.216.34"],
      fetcher: async () => new Response(html, {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "text/html" },
      }),
      now: () => new Date("2026-07-17T07:30:00+09:00"),
    })

    const result = await tool.execute(
      {
        url: "https://finance.example/quote/000660",
        freshnessPolicy: "strict_timestamp",
      },
      {
        artifactStorage: runtime.artifactStorage,
        sessionId: "session-task121",
        runId: "run-task121",
        requestGroupId: "run-task121",
        workDir: process.cwd(),
        userMessage: "현재 값을 확인해줘.",
        source: "webui",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )
    const details = result.details as {
      sourceEvidence: {
        freshnessVerdict?: string
        freshnessReasonCode?: string
        sourceAgeMs?: number
      }
    }

    expect(result.success).toBe(true)
    expect(details.sourceEvidence).toMatchObject({
      freshnessVerdict: "stale",
      freshnessReasonCode: "strict_source_age_exceeded",
    })
    expect(details.sourceEvidence.sourceAgeMs).toBeGreaterThan(20 * 24 * 60 * 60 * 1_000)
    expect(result.output).toContain("- Freshness: stale")
  })

  it("rejects a complete freshness claim backed only by stale evidence", () => {
    const staleEvidence: SuccessfulToolEvidence[] = [
      {
        toolName: "web_fetch",
        output: "stale quote",
        details: {
          sourceEvidence: {
            freshnessPolicy: "strict_timestamp",
            freshnessVerdict: "stale",
          },
        },
        evidenceSource: {
          sourceKind: "web",
          sourceRef: evidenceRef,
          trustClass: "untrusted_external",
          instructionIsolation: "data_only",
        },
      },
    ]
    const freshnessEvidenceRefs = buildCompletionReviewFreshnessEvidenceRefs(staleEvidence)

    expect(freshnessEvidenceRefs).toEqual([])
    expect(
      evaluateCompletionReviewCriterionGate({
        review: {
          status: "complete",
          summary: "완료",
          reason: "모든 기준을 충족했습니다.",
          remainingItems: [],
          criterionAssessments: completeAssessments(),
        },
        allowedEvidenceRefs: [evidenceRef],
        freshnessEvidenceRefs,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_freshness_evidence_invalid",
    })
  })

  it("normalizes yearless market timestamps and preserves the bounded closed-session window", () => {
    const fetchTimestamp = "2026-07-17T00:30:00.000Z"

    expect(normalizeSourceTimestamp("June 26 at 3:30:12 PM GMT+9", fetchTimestamp)).toBe(
      "2026-06-26T06:30:12.000Z",
    )
    expect(normalizeSourceTimestamp("Jul 16, 6:18:05 PM GMT+9", fetchTimestamp)).toBe(
      "2026-07-16T09:18:05.000Z",
    )
    expect(
      assessSourceFreshness({
        sourceTimestamp: "July 13 at 3:30:00 PM GMT+9",
        fetchTimestamp,
        freshnessPolicy: "strict_timestamp",
      }),
    ).toMatchObject({
      freshnessVerdict: "fresh",
      freshnessReasonCode: "strict_source_age_within_limit",
      normalizedSourceTimestamp: "2026-07-13T06:30:00.000Z",
    })
    expect(
      assessSourceFreshness({
        sourceTimestamp: null,
        fetchTimestamp,
        freshnessPolicy: "strict_timestamp",
      }),
    ).toMatchObject({
      freshnessVerdict: "unknown",
      freshnessReasonCode: "strict_source_timestamp_missing",
    })
  })
})
