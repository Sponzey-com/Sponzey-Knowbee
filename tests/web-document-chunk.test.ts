import { describe, expect, it } from "vitest"
import {
  chunkWebDocument,
} from "../packages/core/src/contracts/web-document-chunk.ts"
import type { TokenEstimatorPort } from "../packages/core/src/contracts/web-research-context-budget.ts"
import type { WebDocument } from "../packages/core/src/contracts/web-retrieval.ts"

const budgetFingerprint = `sha256:${"a".repeat(64)}` as const
const estimator: TokenEstimatorPort = {
  version: "fixture-word-v1",
  estimateTokens(text) {
    return text.trim() ? text.trim().split(/\s+/u).length : 0
  },
}
const words = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(" ")

function document(markdown: string): WebDocument {
  return Object.freeze({
    evidenceRef: "document:report",
    title: "Report",
    url: "https://example.com/report",
    markdown,
    truncated: false,
    sourceEvidence: Object.freeze({
      method: "direct_fetch",
      sourceKind: "third_party",
      reliability: "medium",
      sourceUrl: "https://example.com/report",
      sourceDomain: "example.com",
      fetchTimestamp: "2026-07-24T01:00:00.000Z",
    }),
  })
}

describe("web document chunks", () => {
  it("prefers heading and paragraph boundaries and preserves provenance offsets", () => {
    const markdown = `# First\n\n${words(350, "a")}\n\n# Second\n\n${words(350, "b")}`
    const source = document(markdown)

    const result = chunkWebDocument({
      document: source,
      budgetFingerprint,
    }, estimator)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(2)
    expect(result.value.map((chunk) => chunk.headingPath)).toEqual([
      ["First"],
      ["Second"],
    ])
    expect(result.value.every((chunk) =>
      chunk.estimatedTokens >= 300 && chunk.estimatedTokens <= 600)).toBe(true)
    for (const [index, chunk] of result.value.entries()) {
      expect(chunk.ordinal).toBe(index + 1)
      expect(chunk.documentEvidenceRef).toBe(source.evidenceRef)
      expect(chunk.budgetFingerprint).toBe(budgetFingerprint)
      expect(chunk.contentFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
      expect(markdown.slice(chunk.sourceOffsets.start, chunk.sourceOffsets.end))
        .toBe(chunk.content)
      expect(Object.isFrozen(chunk)).toBe(true)
      expect(Object.isFrozen(chunk.headingPath)).toBe(true)
      expect(Object.isFrozen(chunk.sourceOffsets)).toBe(true)
    }
  })

  it("splits an oversized paragraph at word boundaries and permits only the last remainder below 300", () => {
    const result = chunkWebDocument({
      document: document(words(650, "long")),
      budgetFingerprint,
    }, estimator)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((chunk) => chunk.estimatedTokens)).toEqual([600, 50])
    expect(result.value[0]?.content.endsWith("long599")).toBe(true)
    expect(result.value[1]?.content.startsWith("long600")).toBe(true)
  })

  it("is deterministic and does not mutate the source document", () => {
    const source = document(`# Stable\n\n${words(320, "stable")}`)

    const first = chunkWebDocument({ document: source, budgetFingerprint }, estimator)
    const repeated = chunkWebDocument({ document: source, budgetFingerprint }, estimator)

    expect(first).toEqual(repeated)
    expect(source.markdown.startsWith("# Stable")).toBe(true)
  })

  it.each([
    ["invalid budget fingerprint", "invalid", estimator],
    ["invalid estimator", budgetFingerprint, { version: "", estimateTokens: () => -1 }],
  ] as const)("rejects %s", (_label, fingerprint, tokenEstimator) => {
    expect(chunkWebDocument({
      document: document("content"),
      budgetFingerprint: fingerprint,
    }, tokenEstimator)).toMatchObject({ ok: false })
  })
})
