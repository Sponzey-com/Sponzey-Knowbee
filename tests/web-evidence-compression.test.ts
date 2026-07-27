import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import type { WebDocumentChunk } from "../packages/core/src/contracts/web-document-chunk.ts"
import {
  compressWebResearchEvidence,
  type WebEvidenceCompressionPort,
} from "../packages/core/src/runs/web-evidence-compression.ts"

const budgetFingerprint = `sha256:${"1".repeat(64)}` as const
const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const

function chunk(ordinal: number, content: string): WebDocumentChunk {
  return Object.freeze({
    chunkRef: `document:report:chunk:${ordinal}`,
    documentEvidenceRef: "document:report",
    ordinal,
    headingPath: Object.freeze(["Price"]),
    content,
    estimatedTokens: content.split(/\s+/u).length,
    contentFingerprint: hash(content),
    sourceOffsets: Object.freeze({ start: ordinal * 100, end: ordinal * 100 + content.length }),
    budgetFingerprint,
  })
}

const source = Object.freeze({
  sourceTitle: "Market report",
  url: "https://example.com/report",
  publishedAt: "2026-07-24T00:00:00.000Z",
  retrievedAt: "2026-07-24T01:00:00.000Z",
  evidenceRef: "document:report",
  budgetFingerprint,
})

function validReceipt() {
  return {
    budgetFingerprint,
    evidenceRef: "document:report",
    units: [{
      claim: "The current price is 100.",
      evidence: "Current price: 100 at 10:00 KST.",
      chunkRefs: ["document:report:chunk:1"],
      factKey: "current_price",
      supportType: "direct",
      confidence: 0.95,
    }],
    unresolvedFactKeys: [],
  }
}

describe("selected chunk evidence compression", () => {
  it("passes only selected chunks to the LLM and binds trusted source metadata", async () => {
    const selectedChunks = Object.freeze([
      chunk(1, "Current price: 100 at 10:00 KST."),
      chunk(2, "Previous close: 95."),
    ])
    const compressEvidence = vi.fn(async () => validReceipt())
    const port: WebEvidenceCompressionPort = { compressEvidence }

    const result = await compressWebResearchEvidence({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      source,
      selectedChunks,
    }, port)

    expect(result).toMatchObject({
      ok: true,
      value: {
        units: [{
          claim: "The current price is 100.",
          sourceTitle: "Market report",
          url: "https://example.com/report",
          publishedAt: "2026-07-24T00:00:00.000Z",
          retrievedAt: "2026-07-24T01:00:00.000Z",
          evidenceRef: "document:report",
          chunkRefs: ["document:report:chunk:1"],
        }],
      },
    })
    const llmInput = compressEvidence.mock.calls[0]?.[0]
    expect(llmInput?.selectedChunks).toHaveLength(2)
    expect(JSON.stringify(llmInput)).not.toContain("unselected secret")
    expect(Object.isFrozen(result.ok && result.value.units)).toBe(true)
  })

  it.each([
    ["forged evidence ref", () => ({ ...validReceipt(), evidenceRef: "document:forged" })],
    ["unselected chunk ref", () => ({
      ...validReceipt(),
      units: [{ ...validReceipt().units[0], chunkRefs: ["document:report:chunk:9"] }],
    })],
    ["unknown fact key", () => ({
      ...validReceipt(),
      units: [{ ...validReceipt().units[0], factKey: "invented_fact" }],
    })],
    ["invented excerpt", () => ({
      ...validReceipt(),
      units: [{ ...validReceipt().units[0], evidence: "A sentence not present in any chunk." }],
    })],
    ["confidence outside range", () => ({
      ...validReceipt(),
      units: [{ ...validReceipt().units[0], confidence: 1.1 }],
    })],
    ["raw document field", () => ({
      ...validReceipt(),
      rawDocument: "must not be accepted",
    })],
    ["duplicate unit", () => ({
      ...validReceipt(),
      units: [validReceipt().units[0], validReceipt().units[0]],
    })],
  ])("rejects %s", async (_label, receipt) => {
    const port: WebEvidenceCompressionPort = {
      compressEvidence: async () => receipt(),
    }

    expect(await compressWebResearchEvidence({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      source,
      selectedChunks: [chunk(1, "Current price: 100 at 10:00 KST.")],
    }, port)).toMatchObject({ ok: false })
  })
})
