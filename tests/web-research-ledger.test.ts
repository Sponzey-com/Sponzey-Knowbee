import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  appendWebResearchEvidence,
  appendWebResearchExecutionEvent,
  createWebResearchEvidenceLedger,
  createWebResearchExecutionLedger,
  projectAttemptedWebResearchMethods,
} from "../packages/core/src/contracts/web-research-ledger.js"

const RUN_ID = "run:web-ledger"
const SEARCH_STRATEGY = `sha256:${"a".repeat(64)}` as const
const FETCH_STRATEGY = `sha256:${"b".repeat(64)}` as const

function appendExecution(
  ledger: ReturnType<typeof createWebResearchExecutionLedger>,
  event: Parameters<typeof appendWebResearchExecutionEvent>[0]["event"],
) {
  const result = appendWebResearchExecutionEvent({ ledger, event })
  if (!result.ok) throw new Error(result.reasonCode)
  return result.ledger
}

describe("web research execution and evidence ledgers", () => {
  it("preserves actual multi-step method and evidence order without raw content", () => {
    let execution = createWebResearchExecutionLedger(RUN_ID)
    execution = appendExecution(execution, {
      eventId: "event:search:started",
      runId: RUN_ID,
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH_STRATEGY,
      state: "started",
      evidenceRefs: [],
      recordedAt: 1,
    })
    execution = appendExecution(execution, {
      eventId: "event:search:succeeded",
      runId: RUN_ID,
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH_STRATEGY,
      state: "succeeded",
      evidenceRefs: ["evidence:search:1"],
      recordedAt: 2,
    })
    execution = appendExecution(execution, {
      eventId: "event:fetch:started",
      runId: RUN_ID,
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_STRATEGY,
      state: "started",
      evidenceRefs: [],
      recordedAt: 3,
    })
    execution = appendExecution(execution, {
      eventId: "event:fetch:succeeded",
      runId: RUN_ID,
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_STRATEGY,
      state: "succeeded",
      evidenceRefs: ["evidence:document:1"],
      recordedAt: 4,
    })

    let evidence = createWebResearchEvidenceLedger(RUN_ID)
    const searchEvidence = appendWebResearchEvidence({
      ledger: evidence,
      executionLedger: execution,
      entry: {
        entryId: "entry:search:1",
        runId: RUN_ID,
        evidenceRef: "evidence:search:1",
        kind: "search_result",
        method: "fast_text_search",
        parentActionReceiptId: "receipt:search",
        provenanceRef: "provenance:search:1",
        parentEvidenceRefs: [],
      },
    })
    expect(searchEvidence.ok).toBe(true)
    if (!searchEvidence.ok) throw new Error(searchEvidence.reasonCode)
    evidence = searchEvidence.ledger
    const documentEvidence = appendWebResearchEvidence({
      ledger: evidence,
      executionLedger: execution,
      entry: {
        entryId: "entry:document:1",
        runId: RUN_ID,
        evidenceRef: "evidence:document:1",
        kind: "document",
        method: "direct_fetch",
        parentActionReceiptId: "receipt:fetch",
        provenanceRef: "provenance:document:1",
        parentEvidenceRefs: ["evidence:search:1"],
      },
    })
    expect(documentEvidence.ok).toBe(true)
    if (!documentEvidence.ok) throw new Error(documentEvidence.reasonCode)

    expect(projectAttemptedWebResearchMethods(execution)).toEqual([
      "fast_text_search",
      "direct_fetch",
    ])
    expect(documentEvidence.ledger.entries).toEqual([
      expect.objectContaining({
        sequence: 1,
        evidenceRef: "evidence:search:1",
        parentActionReceiptId: "receipt:search",
      }),
      expect.objectContaining({
        sequence: 2,
        evidenceRef: "evidence:document:1",
        parentEvidenceRefs: ["evidence:search:1"],
      }),
    ])
    expect(JSON.stringify(documentEvidence.ledger)).not.toMatch(
      /current public value|https?:|raw|markdown|query/iu,
    )
  })

  it("projects direct-fetch-only and repeated fetch attempts from actual starts", () => {
    let ledger = createWebResearchExecutionLedger(RUN_ID)
    for (const [index, receiptId] of ["receipt:fetch:1", "receipt:fetch:2"].entries()) {
      ledger = appendExecution(ledger, {
        eventId: `event:fetch:${index}:started`,
        runId: RUN_ID,
        actionReceiptId: receiptId,
        method: "direct_fetch",
        strategyFingerprint: `sha256:${String(index + 1).repeat(64)}`,
        state: "started",
        evidenceRefs: [],
        recordedAt: index + 1,
      })
    }

    expect(projectAttemptedWebResearchMethods(ledger)).toEqual(["direct_fetch", "direct_fetch"])
  })

  it("rejects foreign runs, duplicate events and invalid execution transitions", () => {
    const empty = createWebResearchExecutionLedger(RUN_ID)
    const startedEvent = {
      eventId: "event:search:started",
      runId: RUN_ID,
      actionReceiptId: "receipt:search",
      method: "fast_text_search" as const,
      strategyFingerprint: SEARCH_STRATEGY,
      state: "started" as const,
      evidenceRefs: [],
      recordedAt: 1,
    }
    const started = appendWebResearchExecutionEvent({ ledger: empty, event: startedEvent })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.reasonCode)

    expect(
      appendWebResearchExecutionEvent({
        ledger: empty,
        event: { ...startedEvent, runId: "run:foreign" },
      }),
    ).toEqual({ ok: false, reasonCode: "web_execution_run_mismatch" })
    expect(
      appendWebResearchExecutionEvent({ ledger: started.ledger, event: startedEvent }),
    ).toEqual({ ok: false, reasonCode: "web_execution_event_duplicate" })
    expect(
      appendWebResearchExecutionEvent({
        ledger: empty,
        event: {
          ...startedEvent,
          eventId: "event:search:succeeded",
          state: "succeeded",
          evidenceRefs: ["evidence:search:1"],
        },
      }),
    ).toEqual({ ok: false, reasonCode: "web_execution_transition_invalid" })
  })

  it("rejects evidence not bound to a succeeded action receipt or prior parent", () => {
    let execution = createWebResearchExecutionLedger(RUN_ID)
    execution = appendExecution(execution, {
      eventId: "event:fetch:started",
      runId: RUN_ID,
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_STRATEGY,
      state: "started",
      evidenceRefs: [],
      recordedAt: 1,
    })
    const evidence = createWebResearchEvidenceLedger(RUN_ID)
    const entry = {
      entryId: "entry:document:1",
      runId: RUN_ID,
      evidenceRef: "evidence:document:1",
      kind: "document" as const,
      method: "direct_fetch" as const,
      parentActionReceiptId: "receipt:fetch",
      provenanceRef: "provenance:document:1",
      parentEvidenceRefs: ["evidence:missing"],
    }

    expect(
      appendWebResearchEvidence({ ledger: evidence, executionLedger: execution, entry }),
    ).toEqual({ ok: false, reasonCode: "web_evidence_action_not_succeeded" })

    execution = appendExecution(execution, {
      eventId: "event:fetch:succeeded",
      runId: RUN_ID,
      actionReceiptId: "receipt:fetch",
      method: "direct_fetch",
      strategyFingerprint: FETCH_STRATEGY,
      state: "succeeded",
      evidenceRefs: ["evidence:document:1"],
      recordedAt: 2,
    })
    expect(
      appendWebResearchEvidence({ ledger: evidence, executionLedger: execution, entry }),
    ).toEqual({ ok: false, reasonCode: "web_evidence_parent_missing" })
  })

  it("returns new deeply frozen ledgers instead of mutating prior snapshots", () => {
    const first = createWebResearchExecutionLedger(RUN_ID)
    const next = appendWebResearchExecutionEvent({
      ledger: first,
      event: {
        eventId: "event:search:started",
        runId: RUN_ID,
        actionReceiptId: "receipt:search",
        method: "fast_text_search",
        strategyFingerprint: SEARCH_STRATEGY,
        state: "started",
        evidenceRefs: [],
        recordedAt: 1,
      },
    })
    expect(next.ok).toBe(true)
    if (!next.ok) throw new Error(next.reasonCode)

    expect(first.events).toEqual([])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(next.ledger)).toBe(true)
    expect(Object.isFrozen(next.ledger.events)).toBe(true)
    expect(Object.isFrozen(next.ledger.events[0])).toBe(true)
  })

  it("rejects duplicate evidence and keeps the Domain contract free of I/O", () => {
    let execution = createWebResearchExecutionLedger(RUN_ID)
    execution = appendExecution(execution, {
      eventId: "event:search:started",
      runId: RUN_ID,
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH_STRATEGY,
      state: "started",
      evidenceRefs: [],
      recordedAt: 1,
    })
    execution = appendExecution(execution, {
      eventId: "event:search:succeeded",
      runId: RUN_ID,
      actionReceiptId: "receipt:search",
      method: "fast_text_search",
      strategyFingerprint: SEARCH_STRATEGY,
      state: "succeeded",
      evidenceRefs: ["evidence:search:1"],
      recordedAt: 2,
    })
    const empty = createWebResearchEvidenceLedger(RUN_ID)
    const entry = {
      entryId: "entry:search:1",
      runId: RUN_ID,
      evidenceRef: "evidence:search:1",
      kind: "search_result" as const,
      method: "fast_text_search" as const,
      parentActionReceiptId: "receipt:search",
      provenanceRef: "provenance:search:1",
      parentEvidenceRefs: [],
    }
    const first = appendWebResearchEvidence({
      ledger: empty,
      executionLedger: execution,
      entry,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.reasonCode)
    expect(
      appendWebResearchEvidence({
        ledger: first.ledger,
        executionLedger: execution,
        entry,
      }),
    ).toEqual({ ok: false, reasonCode: "web_evidence_entry_duplicate" })

    const source = readFileSync("packages/core/src/contracts/web-research-ledger.ts", "utf8")
    expect(source).not.toMatch(
      /from\s+["']node:|process\.env|globalThis\.fetch|await\s+fetch\(|db\/|logger\//u,
    )
  })
})
