import { describe, expect, it, vi } from "vitest"
import {
  createWebSearchMetadataSnapshot,
  selectWebResearchSources,
  type WebSourceSelectionPort,
} from "../packages/core/src/runs/web-source-selection.ts"
import type {
  WebSearchMetadataObservation,
} from "../packages/core/src/contracts/web-research-observation.ts"

const budgetFingerprint = `sha256:${"b".repeat(64)}` as const

function observation(count = 5): WebSearchMetadataObservation {
  return Object.freeze({
    kind: "search_metadata",
    provider: "DuckDuckGo",
    retrievedAt: "2026-07-24T01:00:00.000Z",
    resultCount: count,
    results: Object.freeze(Array.from({ length: count }, (_, index) => {
      const rank = index + 1
      return Object.freeze({
        evidenceRef: `search:${rank}`,
        rank,
        title: `Result ${rank}`,
        url: `https://example.com/result-${rank}`,
        domain: "example.com",
        snippet: `Metadata summary ${rank}`,
        sourceEvidence: Object.freeze({
          method: "fast_text_search" as const,
          sourceKind: "search_index" as const,
          reliability: "medium" as const,
          sourceUrl: `https://example.com/result-${rank}`,
          sourceDomain: "example.com",
          sourceTimestamp: rank === 1 ? "2026-07-24T00:00:00.000Z" : null,
          fetchTimestamp: "2026-07-24T01:00:00.000Z",
        }),
      })
    })),
  })
}

function validReceipt(snapshotFingerprint: string, count = 3) {
  return {
    snapshotFingerprint,
    budgetFingerprint,
    selections: Array.from({ length: count }, (_, index) => ({
      candidateRef: `search:${index + 1}`,
      relevanceScore: 0.9 - index * 0.1,
      reason: `Supports requested fact ${index + 1}`,
      factKeys: ["current_price"],
    })),
  }
}

describe("metadata-only web source selection", () => {
  it("passes only bounded metadata to the LLM port and admits three selections by default", async () => {
    const snapshot = createWebSearchMetadataSnapshot({
      observation: observation(16),
      budgetFingerprint,
    })
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    const selectSources = vi.fn(async (input) =>
      validReceipt(input.snapshot.snapshotFingerprint))
    const port: WebSourceSelectionPort = { selectSources }

    const selected = await selectWebResearchSources({
      requestGoal: "Find the current price with a timestamp.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
    }, port)

    expect(selected).toMatchObject({ ok: true, value: { selections: [
      { candidateRef: "search:1" },
      { candidateRef: "search:2" },
      { candidateRef: "search:3" },
    ] } })
    const llmInput = selectSources.mock.calls[0]?.[0]
    expect(llmInput?.maxSelections).toBe(3)
    expect(llmInput?.snapshot.candidates).toHaveLength(16)
    expect(Object.keys(llmInput?.snapshot.candidates[0] ?? {}).sort()).toEqual([
      "candidateRef",
      "domain",
      "publishedAt",
      "rank",
      "snippet",
      "sourceKind",
      "title",
      "url",
    ])
    expect(JSON.stringify(llmInput)).not.toContain("markdown")
    expect(JSON.stringify(llmInput)).not.toContain("body")
    expect(Object.isFrozen(snapshot.value)).toBe(true)
    expect(Object.isFrozen(snapshot.value.candidates)).toBe(true)
  })

  it("allows an explicit ceiling of five but never more", async () => {
    const snapshot = createWebSearchMetadataSnapshot({
      observation: observation(6),
      budgetFingerprint,
    })
    if (!snapshot.ok) throw new Error(snapshot.reasonCode)
    const five: WebSourceSelectionPort = {
      selectSources: async () => validReceipt(snapshot.value.snapshotFingerprint, 5),
    }

    const selected = await selectWebResearchSources({
      requestGoal: "Compare sources.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
      maxSelections: 5,
    }, five)

    expect(selected.ok && selected.value.selections).toHaveLength(5)
    expect(await selectWebResearchSources({
      requestGoal: "Invalid ceiling.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
      maxSelections: 6,
    }, five)).toMatchObject({ ok: false })
  })

  it.each([
    ["stale fingerprint", (fingerprint: string) => ({
      ...validReceipt(fingerprint),
      snapshotFingerprint: `sha256:${"c".repeat(64)}`,
    })],
    ["invented ref", (fingerprint: string) => ({
      ...validReceipt(fingerprint),
      selections: [{
        candidateRef: "search:invented",
        relevanceScore: 0.8,
        reason: "Invented",
        factKeys: ["current_price"],
      }],
    })],
    ["duplicate ref", (fingerprint: string) => ({
      ...validReceipt(fingerprint),
      selections: [
        ...validReceipt(fingerprint).selections.slice(0, 1),
        ...validReceipt(fingerprint).selections.slice(0, 1),
      ],
    })],
    ["score outside range", (fingerprint: string) => ({
      ...validReceipt(fingerprint),
      selections: [{
        candidateRef: "search:1",
        relevanceScore: 1.1,
        reason: "Too high",
        factKeys: ["current_price"],
      }],
    })],
    ["unknown fact key", (fingerprint: string) => ({
      ...validReceipt(fingerprint),
      selections: [{
        candidateRef: "search:1",
        relevanceScore: 0.8,
        reason: "Unknown fact",
        factKeys: ["invented_fact"],
      }],
    })],
  ])("rejects %s from the LLM", async (_label, receipt) => {
    const snapshot = createWebSearchMetadataSnapshot({
      observation: observation(),
      budgetFingerprint,
    })
    if (!snapshot.ok) throw new Error(snapshot.reasonCode)
    const port: WebSourceSelectionPort = {
      selectSources: async () => receipt(snapshot.value.snapshotFingerprint),
    }

    expect(await selectWebResearchSources({
      requestGoal: "Find current price.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
    }, port)).toMatchObject({ ok: false })
  })
})
