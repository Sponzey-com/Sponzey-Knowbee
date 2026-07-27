import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import type { WebEvidencePack } from "../packages/core/src/contracts/web-evidence-pack.ts"
import type { WebEvidenceUnit } from "../packages/core/src/contracts/web-evidence-compression.ts"
import {
  verifyWebEvidencePack,
  type WebEvidenceVerifierPort,
} from "../packages/core/src/runs/web-evidence-verifier.ts"

const fingerprint = (character: string) =>
  `sha256:${character.repeat(64)}` as const
const budgetFingerprint = fingerprint("1")
const snapshotFingerprint = fingerprint("2")

function unit(factKey = "current_price"): WebEvidenceUnit {
  const claim = "The current price is 100."
  const evidence = "Current price: 100."
  return Object.freeze({
    unitRef: `sha256:${createHash("sha256").update(`${claim}:${evidence}`).digest("hex")}`,
    claim,
    evidence,
    sourceTitle: "Market report",
    url: "https://example.com/report",
    publishedAt: "2026-07-24T00:00:00.000Z",
    retrievedAt: "2026-07-24T01:00:00.000Z",
    evidenceRef: "document:report",
    chunkRefs: Object.freeze(["document:report:chunk:1"]),
    factKey,
    supportType: "direct",
    confidence: 0.95,
    budgetFingerprint,
  })
}

function pack(overrides: Partial<WebEvidencePack> = {}): WebEvidencePack {
  const evidenceUnit = unit()
  return Object.freeze({
    schemaVersion: 1,
    packFingerprint: fingerprint("3"),
    budgetFingerprint,
    evidenceSnapshotFingerprint: snapshotFingerprint,
    units: Object.freeze([evidenceUnit]),
    conflicts: Object.freeze([]),
    unresolvedFactKeys: Object.freeze([]),
    provenanceIndex: Object.freeze([Object.freeze({
      evidenceRef: evidenceUnit.evidenceRef,
      sourceTitle: evidenceUnit.sourceTitle,
      url: evidenceUnit.url,
      publishedAt: evidenceUnit.publishedAt,
      retrievedAt: evidenceUnit.retrievedAt,
      chunkRefs: evidenceUnit.chunkRefs,
    })]),
    droppedUnitRefs: Object.freeze([]),
    totalTokenEstimate: 200,
    ...overrides,
  })
}

function sufficientReceipt(evidencePack: WebEvidencePack) {
  return {
    packFingerprint: evidencePack.packFingerprint,
    budgetFingerprint: evidencePack.budgetFingerprint,
    status: "sufficient",
    answerDraft: "The current price is 100 as of 10:00.",
    supportedUnitRefs: [evidencePack.units[0]!.unitRef],
    unresolvedFactKeys: [],
  }
}

describe("evidence-pack-only final verifier", () => {
  it("passes only the goal, facts, and bounded evidence pack to the LLM", async () => {
    const evidencePack = pack()
    const verifyEvidence = vi.fn(async (input) => sufficientReceipt(input.evidencePack))
    const port: WebEvidenceVerifierPort = { verifyEvidence }

    const result = await verifyWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      evidencePack,
    }, port)

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "sufficient",
        answerDraft: "The current price is 100 as of 10:00.",
        supportedUnitRefs: [evidencePack.units[0]!.unitRef],
      },
    })
    const verifierInput = verifyEvidence.mock.calls[0]?.[0]
    expect(Object.keys(verifierInput ?? {}).sort()).toEqual([
      "evidencePack",
      "requestGoal",
      "requiredFactKeys",
    ])
    expect(JSON.stringify(verifierInput)).not.toMatch(
      /diagnosisPayload|markdown|chunk content|ledger/iu,
    )
    expect(Object.isFrozen(result.ok && result.value)).toBe(true)
  })

  it.each([
    ["stale pack", (evidencePack: WebEvidencePack) => ({
      ...sufficientReceipt(evidencePack),
      packFingerprint: fingerprint("9"),
    })],
    ["forged unit", (evidencePack: WebEvidencePack) => ({
      ...sufficientReceipt(evidencePack),
      supportedUnitRefs: [fingerprint("8")],
    })],
    ["supported and unresolved fact", (evidencePack: WebEvidencePack) => ({
      ...sufficientReceipt(evidencePack),
      status: "insufficient",
      unresolvedFactKeys: ["current_price"],
    })],
    ["raw payload field", (evidencePack: WebEvidencePack) => ({
      ...sufficientReceipt(evidencePack),
      diagnosisPayload: { raw: true },
    })],
  ])("rejects %s", async (_label, receipt) => {
    const evidencePack = pack()
    const port: WebEvidenceVerifierPort = {
      verifyEvidence: async () => receipt(evidencePack),
    }
    expect(await verifyWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      evidencePack,
    }, port)).toMatchObject({ ok: false })
  })

  it("requires a conflicted result when the evidence pack contains a conflict", async () => {
    const first = unit()
    const second = Object.freeze({
      ...unit(),
      unitRef: fingerprint("7"),
      claim: "The current price is 101.",
      evidenceRef: "document:other",
    })
    const evidencePack = pack({
      units: Object.freeze([first, second]),
      conflicts: Object.freeze([Object.freeze({
        factKey: "current_price",
        unitRefs: Object.freeze([first.unitRef, second.unitRef]),
        reason: "Different current prices.",
      })]),
    })
    const port: WebEvidenceVerifierPort = {
      verifyEvidence: async () => sufficientReceipt(evidencePack),
    }

    expect(await verifyWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      evidencePack,
    }, port)).toMatchObject({ ok: false })
  })

  it("preserves an LLM conflict verdict and unresolved fact instead of selecting a value", async () => {
    const first = unit()
    const second = Object.freeze({
      ...unit(),
      unitRef: fingerprint("7"),
      claim: "The current price is 101.",
      evidenceRef: "document:other",
    })
    const evidencePack = pack({
      units: Object.freeze([first, second]),
      conflicts: Object.freeze([Object.freeze({
        factKey: "current_price",
        unitRefs: Object.freeze([first.unitRef, second.unitRef]),
        reason: "Different current prices.",
      })]),
    })

    expect(await verifyWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      evidencePack,
    }, {
      verifyEvidence: async () => ({
        packFingerprint: evidencePack.packFingerprint,
        budgetFingerprint: evidencePack.budgetFingerprint,
        status: "conflicted",
        answerDraft: "Sources disagree, so no current value is selected.",
        supportedUnitRefs: [],
        unresolvedFactKeys: ["current_price"],
      }),
    })).toMatchObject({
      ok: true,
      value: {
        status: "conflicted",
        supportedUnitRefs: [],
        unresolvedFactKeys: ["current_price"],
      },
    })
  })
})
