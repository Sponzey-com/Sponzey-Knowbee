import { describe, expect, it } from "vitest"

import {
  admitPersistedWebResearchRunTrace,
  createWebResearchRunRecorder,
  WEB_RESEARCH_RUN_TRACE_POLICY_VERSION,
} from "../packages/core/src/runs/web-research-run-recorder.js"

const SEARCH = `sha256:${"a".repeat(64)}` as const
const FETCH_A = `sha256:${"b".repeat(64)}` as const
const FETCH_B = `sha256:${"c".repeat(64)}` as const

describe("web research production run recorder", () => {
  it("records actual search and multiple fetch order before verified completion", () => {
    let timestamp = 0
    const recorder = createWebResearchRunRecorder({
      runId: "run:trace",
      now: () => ++timestamp,
    })
    expect(recorder.startAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
    }).ok).toBe(true)
    expect(recorder.finishAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
      outcome: "succeeded",
      evidence: [{
        evidenceRef: "search:1",
        kind: "search_result",
        provenanceRef: "provenance:search:1",
        parentEvidenceRefs: [],
      }],
    }).ok).toBe(true)
    for (const [index, fingerprint] of [FETCH_A, FETCH_B].entries()) {
      expect(recorder.snapshot().machine.state).toBe(
        index === 0 ? "CANDIDATES_READY" : "EVIDENCE_READY",
      )
      const started = recorder.startAction({
        actionReceiptId: `receipt:fetch:${index}`,
        method: "direct_fetch",
        strategyFingerprint: fingerprint,
      })
      expect(started).toEqual(expect.objectContaining({ ok: true }))
      expect(recorder.finishAction({
        actionReceiptId: `receipt:fetch:${index}`,
        method: "direct_fetch",
        strategyFingerprint: fingerprint,
        outcome: "succeeded",
        evidence: [{
          evidenceRef: `document:${index}`,
          kind: "document",
          provenanceRef: `provenance:document:${index}`,
          parentEvidenceRefs: ["search:1"],
        }],
      }).ok).toBe(true)
    }
    expect(recorder.startVerification().ok).toBe(true)
    expect(recorder.finishVerification({ outcome: "succeeded" }).ok).toBe(true)

    const trace = recorder.snapshot()
    expect(trace.machine.state).toBe("COMPLETED")
    expect(trace).toMatchObject({
      schemaVersion: 1,
      policyVersion: WEB_RESEARCH_RUN_TRACE_POLICY_VERSION,
    })
    expect(trace.attemptedMethods).toEqual([
      "fast_text_search",
      "direct_fetch",
      "direct_fetch",
    ])
    expect(trace.evidenceLedger.entries.map((entry) => entry.evidenceRef)).toEqual([
      "search:1",
      "document:0",
      "document:1",
    ])
    expect(JSON.stringify(trace)).not.toMatch(/markdown|raw body|https?:/iu)
  })

  it("verifies validated search evidence when the LLM does not request a fetch", () => {
    const recorder = createWebResearchRunRecorder({ runId: "run:search-only" })
    expect(recorder.startAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
    }).ok).toBe(true)
    expect(recorder.finishAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
      outcome: "succeeded",
      evidence: [{
        evidenceRef: "search:1",
        kind: "search_result",
        provenanceRef: "provenance:search:1",
        parentEvidenceRefs: [],
      }],
    }).ok).toBe(true)

    expect(recorder.snapshot().machine.state).toBe("CANDIDATES_READY")
    expect(recorder.startVerification().ok).toBe(true)
    expect(recorder.finishVerification({ outcome: "succeeded" }).ok).toBe(true)
    expect(recorder.snapshot().machine.state).toBe("COMPLETED")
  })

  it("does not record rejected repeats as attempted execution", () => {
    const recorder = createWebResearchRunRecorder({ runId: "run:repeat" })
    expect(recorder.startAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
    }).ok).toBe(true)
    expect(recorder.finishAction({
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
      outcome: "failed",
      reasonCode: "network",
    }).ok).toBe(true)
    expect(recorder.startAction({
      actionReceiptId: "receipt:repeat",
      method: "fast_text_search",
      strategyFingerprint: SEARCH,
    })).toEqual({
      ok: false,
      reasonCode: "web_research_run_transition_rejected",
    })
    expect(recorder.snapshot().attemptedMethods).toEqual(["fast_text_search"])
  })

  it("requires evidence and verification before completed", () => {
    const recorder = createWebResearchRunRecorder({ runId: "run:verify" })
    expect(recorder.startAction({
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_A,
    }).ok).toBe(true)
    expect(recorder.finishAction({
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_A,
      outcome: "succeeded",
      evidence: [],
    })).toEqual({
      ok: false,
      reasonCode: "web_research_run_evidence_rejected",
    })
    expect(recorder.snapshot().machine.state).toBe("FETCHING")
  })

  it("admits only the exact persisted trace schema and policy version", () => {
    const trace = createWebResearchRunRecorder({ runId: "run:version" }).snapshot()
    expect(admitPersistedWebResearchRunTrace(trace)).toEqual({
      ok: true,
      trace,
    })
    expect(admitPersistedWebResearchRunTrace({
      ...trace,
      schemaVersion: 2,
    })).toEqual({
      ok: false,
      reasonCode: "web_research_trace_schema_unsupported",
    })
    expect(admitPersistedWebResearchRunTrace({
      ...trace,
      policyVersion: "web-research-trace-vNext",
    })).toEqual({
      ok: false,
      reasonCode: "web_research_trace_policy_unsupported",
    })
  })
})
