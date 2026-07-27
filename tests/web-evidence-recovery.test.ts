import { describe, expect, it, vi } from "vitest"

import type {
  WebEvidenceVerificationResult,
} from "../packages/core/src/contracts/web-evidence-verifier.ts"
import {
  planWebEvidenceRecovery,
  type WebEvidenceRecoveryPort,
} from "../packages/core/src/runs/web-evidence-recovery.ts"

const fingerprint = (character: string) =>
  `sha256:${character.repeat(64)}` as const
const priorFingerprint = fingerprint("1")
const changedSearchFingerprint = fingerprint("2")
const changedFetchFingerprint = fingerprint("3")
const packFingerprint = fingerprint("4")

const verification: WebEvidenceVerificationResult = Object.freeze({
  packFingerprint,
  budgetFingerprint: fingerprint("5"),
  status: "insufficient",
  answerDraft: null,
  supportedUnitRefs: Object.freeze([]),
  unresolvedFactKeys: Object.freeze(["current_price"]),
})

function changedReceipt() {
  return {
    packFingerprint,
    action: "continue",
    candidates: [
      {
        candidateId: "recovery:search:price",
        factKey: "current_price",
        kind: "search",
        query: "SK hynix live price 2026-07-24",
        strategyFingerprint: changedSearchFingerprint,
      },
      {
        candidateId: "recovery:fetch:exchange",
        factKey: "current_price",
        kind: "fetch",
        sourceUrl: "https://example.com/exchange/000660",
        evidenceRef: "search:exchange",
        strategyFingerprint: changedFetchFingerprint,
      },
    ],
  }
}

describe("unresolved fact web recovery", () => {
  it("admits changed search and fetch candidates without raw evidence", async () => {
    const proposeRecovery = vi.fn(async () => changedReceipt())
    const port: WebEvidenceRecoveryPort = { proposeRecovery }

    const result = await planWebEvidenceRecovery({
      runId: "run-1",
      verification,
      attemptedStrategyFingerprints: [priorFingerprint],
      blockedAllowed: false,
      signal: new AbortController().signal,
    }, port)

    expect(result).toMatchObject({
      ok: true,
      value: {
        action: "continue",
        candidates: [
          { kind: "search", factKey: "current_price" },
          { kind: "fetch", factKey: "current_price" },
        ],
      },
    })
    const llmInput = proposeRecovery.mock.calls[0]?.[0]
    expect(Object.keys(llmInput ?? {}).sort()).toEqual([
      "allowedMethods",
      "attemptedStrategyFingerprints",
      "blockedAllowed",
      "packFingerprint",
      "runId",
      "unresolvedFactKeys",
    ])
    expect(JSON.stringify(llmInput)).not.toMatch(/evidence|markdown|content|diagnosisPayload/iu)
    expect(Object.isFrozen(result.ok && result.value)).toBe(true)
  })

  it.each([
    ["unchanged strategy", () => ({
      ...changedReceipt(),
      candidates: [{
        ...changedReceipt().candidates[0],
        strategyFingerprint: priorFingerprint,
      }],
    })],
    ["duplicate strategy", () => ({
      ...changedReceipt(),
      candidates: [
        changedReceipt().candidates[0],
        { ...changedReceipt().candidates[0], candidateId: "duplicate" },
      ],
    })],
    ["unknown fact", () => ({
      ...changedReceipt(),
      candidates: [{
        ...changedReceipt().candidates[0],
        factKey: "invented_fact",
      }],
    })],
    ["stale pack", () => ({
      ...changedReceipt(),
      packFingerprint: fingerprint("9"),
    })],
    ["blocked while candidate remains", () => ({
      ...changedReceipt(),
      action: "blocked",
    })],
  ])("rejects %s", async (_label, receipt) => {
    const port: WebEvidenceRecoveryPort = {
      proposeRecovery: async () => receipt(),
    }
    expect(await planWebEvidenceRecovery({
      runId: "run-1",
      verification,
      attemptedStrategyFingerprints: [priorFingerprint],
      blockedAllowed: false,
      signal: new AbortController().signal,
    }, port)).toMatchObject({ ok: false })
  })

  it("does not call the LLM after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    const proposeRecovery = vi.fn(async () => changedReceipt())

    expect(await planWebEvidenceRecovery({
      runId: "run-1",
      verification,
      attemptedStrategyFingerprints: [priorFingerprint],
      blockedAllowed: false,
      signal: controller.signal,
    }, { proposeRecovery })).toEqual({
      ok: false,
      reasonCode: "web_evidence_recovery_cancelled",
    })
    expect(proposeRecovery).not.toHaveBeenCalled()
  })

  it("admits an LLM blocked result only after the caller proves no materially changed path remains", async () => {
    const proposeRecovery = vi.fn(async () => ({
      packFingerprint,
      action: "blocked",
      candidates: [],
    }))

    expect(await planWebEvidenceRecovery({
      runId: "run-1",
      verification,
      attemptedStrategyFingerprints: [priorFingerprint],
      blockedAllowed: true,
      signal: new AbortController().signal,
    }, { proposeRecovery })).toEqual({
      ok: true,
      value: {
        action: "blocked",
        packFingerprint,
        candidates: [],
      },
    })
  })
})
