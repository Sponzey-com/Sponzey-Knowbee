import { describe, expect, it, vi } from "vitest"

import type { ToolResult } from "../packages/core/src/tools/types.ts"
import {
  runDirectWebEvidencePipeline,
  runWebEvidencePipeline,
  type WebEvidenceSourceFetchPort,
} from "../packages/core/src/runs/web-evidence-pipeline.ts"
import type { TokenEstimatorPort } from "../packages/core/src/contracts/web-research-context-budget.ts"

const estimator: TokenEstimatorPort = {
  version: "fixture-word-v1",
  estimateTokens(text) {
    return text.trim() ? text.trim().split(/\s+/u).length : 0
  },
}
const fetchedAt = "2026-07-24T01:00:00.000Z"
const sourceEvidence = (url: string) => Object.freeze({
  method: "direct_fetch" as const,
  sourceKind: "third_party" as const,
  reliability: "medium" as const,
  sourceUrl: url,
  sourceDomain: new URL(url).hostname,
  sourceTimestamp: "2026-07-24T00:00:00.000Z",
  fetchTimestamp: fetchedAt,
})

function searchResult(): ToolResult {
  return Object.freeze({
    success: true,
    output: "RAW SEARCH MARKDOWN SECRET",
    details: Object.freeze({
      provider: "DuckDuckGo",
      retrievedAt: fetchedAt,
      results: Object.freeze([1, 2, 3].map((rank) => {
        const url = `https://example.com/result-${rank}`
        return Object.freeze({
          evidenceRef: `search:${rank}`,
          rank,
          title: `Result ${rank}`,
          url,
          domain: "example.com",
          snippet: `Metadata ${rank}`,
          sourceEvidence: Object.freeze({
            ...sourceEvidence(url),
            method: "fast_text_search" as const,
            sourceKind: "search_index" as const,
          }),
        })
      })),
    }),
  })
}

function fetchResult(url: string): ToolResult {
  const content = [
    "Current price: 100 at 10:00 KST.",
    ...Array.from({ length: 315 }, (_, index) => `fact${index}`),
  ].join(" ")
  const document = Object.freeze({
    evidenceRef: "document:selected",
    title: "Selected market report",
    url,
    markdown: `# Price\n\n${content}`,
    truncated: false,
    sourceEvidence: sourceEvidence(url),
  })
  return Object.freeze({
    success: true,
    output: "RAW FETCH MARKDOWN SECRET",
    details: Object.freeze({ document, sourceEvidence: document.sourceEvidence, truncated: false }),
  })
}

describe("bounded web evidence Application pipeline", () => {
  it("fetches only the LLM-selected source and gives the verifier only an evidence pack", async () => {
    const sourceSelectionPort = {
      selectSources: vi.fn(async (input) => ({
        snapshotFingerprint: input.snapshot.snapshotFingerprint,
        budgetFingerprint: input.snapshot.budgetFingerprint,
        selections: [{
          candidateRef: "search:2",
          relevanceScore: 0.95,
          reason: "Most relevant current market source.",
          factKeys: ["current_price"],
        }],
      })),
    }
    const fetchSource = vi.fn(async (input) => fetchResult(input.url))
    const chunkSelectionPort = {
      selectChunks: vi.fn(async (input) => ({
        snapshotFingerprint: input.snapshot.snapshotFingerprint,
        budgetFingerprint: input.snapshot.budgetFingerprint,
        selections: [{
          chunkRef: input.snapshot.chunks[0]!.chunkRef,
          relevanceScore: 0.95,
          factKeys: ["current_price"],
        }],
      })),
    }
    const compressionPort = {
      compressEvidence: vi.fn(async (input) => ({
        budgetFingerprint: input.source.budgetFingerprint,
        evidenceRef: input.source.evidenceRef,
        units: [{
          claim: "The current price is 100.",
          evidence: "Current price: 100 at 10:00 KST.",
          chunkRefs: [input.selectedChunks[0]!.chunkRef],
          factKey: "current_price",
          supportType: "direct",
          confidence: 0.95,
        }],
        unresolvedFactKeys: [],
      })),
    }
    const evidenceReviewPort = {
      reviewEvidence: vi.fn(async (input) => ({
        budgetFingerprint: input.budgetFingerprint,
        evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
        duplicateGroups: [],
        conflicts: [],
        unresolvedFactKeys: [],
      })),
    }
    const verifierPort = {
      verifyEvidence: vi.fn(async (input) => ({
        packFingerprint: input.evidencePack.packFingerprint,
        budgetFingerprint: input.evidencePack.budgetFingerprint,
        status: "sufficient",
        answerDraft: "The current price is 100 at 10:00 KST.",
        supportedUnitRefs: [input.evidencePack.units[0]!.unitRef],
        unresolvedFactKeys: [],
      })),
    }

    const result = await runWebEvidencePipeline({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      modelContextTokens: 8_000,
      systemToolText: "system",
      conversationText: "conversation",
      searchResult: searchResult(),
      signal: new AbortController().signal,
    }, {
      estimator,
      sourceSelectionPort,
      fetchSource,
      chunkSelectionPort,
      compressionPort,
      evidenceReviewPort,
      verifierPort,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "sufficient",
        answerDraft: "The current price is 100 at 10:00 KST.",
      },
    })
    expect(fetchSource).toHaveBeenCalledTimes(1)
    expect(fetchSource).toHaveBeenCalledWith(expect.objectContaining({
      candidateRef: "search:2",
      url: "https://example.com/result-2",
    }))
    expect(JSON.stringify(sourceSelectionPort.selectSources.mock.calls)).not.toContain(
      "RAW SEARCH MARKDOWN SECRET",
    )
    expect(JSON.stringify(chunkSelectionPort.selectChunks.mock.calls)).not.toContain(
      "RAW FETCH MARKDOWN SECRET",
    )
    expect(JSON.stringify(verifierPort.verifyEvidence.mock.calls)).not.toMatch(
      /RAW SEARCH|RAW FETCH|markdown|diagnosisPayload/iu,
    )
  })

  it("stops before all ports when cancelled", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchSource = vi.fn<WebEvidenceSourceFetchPort>()
    const sourceSelectionPort = { selectSources: vi.fn() }

    expect(await runWebEvidencePipeline({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: searchResult(),
      signal: controller.signal,
    }, {
      estimator,
      sourceSelectionPort,
      fetchSource,
      chunkSelectionPort: { selectChunks: vi.fn() },
      compressionPort: { compressEvidence: vi.fn() },
      evidenceReviewPort: { reviewEvidence: vi.fn() },
      verifierPort: { verifyEvidence: vi.fn() },
    })).toEqual({
      ok: false,
      reasonCode: "web_evidence_pipeline_cancelled",
    })
    expect(sourceSelectionPort.selectSources).not.toHaveBeenCalled()
    expect(fetchSource).not.toHaveBeenCalled()
  })

  it("rejects an invented source receipt before fetch", async () => {
    const fetchSource = vi.fn<WebEvidenceSourceFetchPort>()
    const sourceSelectionPort = {
      selectSources: vi.fn(async (input) => ({
        snapshotFingerprint: input.snapshot.snapshotFingerprint,
        budgetFingerprint: input.snapshot.budgetFingerprint,
        selections: [{
          candidateRef: "search:invented",
          relevanceScore: 1,
          reason: "Invented.",
          factKeys: ["current_price"],
        }],
      })),
    }

    const result = await runWebEvidencePipeline({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: searchResult(),
      signal: new AbortController().signal,
    }, {
      estimator,
      sourceSelectionPort,
      fetchSource,
      chunkSelectionPort: { selectChunks: vi.fn() },
      compressionPort: { compressEvidence: vi.fn() },
      evidenceReviewPort: { reviewEvidence: vi.fn() },
      verifierPort: { verifyEvidence: vi.fn() },
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "web_evidence_pipeline_source_selection_failed",
    })
    expect(fetchSource).not.toHaveBeenCalled()
  })

  it("verifies one admitted direct document without a search or source-selection call", async () => {
    const documentResult = fetchResult("https://example.com/direct")
    const chunkSelectionPort = {
      selectChunks: vi.fn(async (input) => ({
        snapshotFingerprint: input.snapshot.snapshotFingerprint,
        budgetFingerprint: input.snapshot.budgetFingerprint,
        selections: [{
          chunkRef: input.snapshot.chunks[0]!.chunkRef,
          relevanceScore: 0.98,
          factKeys: ["current_price"],
        }],
      })),
    }
    const compressionPort = {
      compressEvidence: vi.fn(async (input) => ({
        budgetFingerprint: input.source.budgetFingerprint,
        evidenceRef: input.source.evidenceRef,
        units: [{
          claim: "The current price is 100.",
          evidence: "Current price: 100 at 10:00 KST.",
          chunkRefs: [input.selectedChunks[0]!.chunkRef],
          factKey: "current_price",
          supportType: "direct",
          confidence: 0.99,
        }],
        unresolvedFactKeys: [],
      })),
    }
    const evidenceReviewPort = {
      reviewEvidence: vi.fn(async (input) => ({
        budgetFingerprint: input.budgetFingerprint,
        evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
        duplicateGroups: [],
        conflicts: [],
        unresolvedFactKeys: [],
      })),
    }
    const verifierPort = {
      verifyEvidence: vi.fn(async (input) => ({
        packFingerprint: input.evidencePack.packFingerprint,
        budgetFingerprint: input.evidencePack.budgetFingerprint,
        status: "sufficient",
        answerDraft: "The current price is 100 at 10:00 KST.",
        supportedUnitRefs: [input.evidencePack.units[0]!.unitRef],
        unresolvedFactKeys: [],
      })),
    }

    const result = await runDirectWebEvidencePipeline({
      requestGoal: "Read the current price from this URL.",
      requiredFactKeys: ["current_price"],
      modelContextTokens: 8_000,
      systemToolText: "system",
      conversationText: "conversation",
      documentResult,
      signal: new AbortController().signal,
    }, {
      estimator,
      chunkSelectionPort,
      compressionPort,
      evidenceReviewPort,
      verifierPort,
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "sufficient",
        answerDraft: "The current price is 100 at 10:00 KST.",
      },
    })
    expect(JSON.stringify(chunkSelectionPort.selectChunks.mock.calls)).not.toContain(
      "RAW FETCH MARKDOWN SECRET",
    )
    expect(JSON.stringify(verifierPort.verifyEvidence.mock.calls)).not.toMatch(
      /RAW FETCH|markdown|diagnosisPayload/iu,
    )
  })
})
