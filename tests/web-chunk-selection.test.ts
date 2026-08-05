import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import type { WebDocumentChunk } from "../packages/core/src/contracts/web-document-chunk.ts"
import {
  createWebChunkSelectionSnapshot,
  selectWebResearchChunks,
  type WebChunkSelectionPort,
} from "../packages/core/src/runs/web-chunk-selection.ts"

const budgetFingerprint = `sha256:${"d".repeat(64)}` as const
const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const

function chunk(
  ordinal: number,
  content = `chunk content ${ordinal}`,
  overrides: Partial<WebDocumentChunk> = {},
): WebDocumentChunk {
  return Object.freeze({
    chunkRef: `document:1:chunk:${ordinal}`,
    documentEvidenceRef: "document:1",
    ordinal,
    headingPath: Object.freeze(["Report"]),
    content,
    estimatedTokens: content.split(/\s+/u).length,
    contentFingerprint: hash(content),
    sourceOffsets: Object.freeze({ start: ordinal * 100, end: ordinal * 100 + content.length }),
    budgetFingerprint,
    ...overrides,
  })
}

function receipt(snapshotFingerprint: string, refs = [
  "document:1:chunk:1",
  "document:1:chunk:2",
  "document:1:chunk:3",
]) {
  return {
    snapshotFingerprint,
    budgetFingerprint,
    selections: refs.map((chunkRef, index) => ({
      chunkRef,
      relevanceScore: 0.9 - index * 0.1,
      factKeys: ["current_price"],
    })),
  }
}

describe("web chunk selection", () => {
  it("deduplicates exact content before the LLM and admits up to three references", async () => {
    const duplicateContent = "same exact evidence"
    const snapshot = createWebChunkSelectionSnapshot([
      chunk(1),
      chunk(2),
      chunk(3),
      chunk(4, duplicateContent),
      chunk(5, duplicateContent),
    ])
    expect(snapshot).toMatchObject({
      ok: true,
      value: { duplicateChunkRefs: ["document:1:chunk:5"] },
    })
    if (!snapshot.ok) return
    const selectChunks = vi.fn(async (input) =>
      receipt(input.snapshot.snapshotFingerprint))
    const port: WebChunkSelectionPort = { selectChunks }

    const selected = await selectWebResearchChunks({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
    }, port)

    expect(selected.ok && selected.value.selections).toHaveLength(3)
    const llmInput = selectChunks.mock.calls[0]?.[0]
    expect(llmInput?.maxSelections).toBe(3)
    expect(llmInput?.snapshot.chunks).toHaveLength(4)
    expect(llmInput?.snapshot.chunks.map((item) => item.chunkRef))
      .not.toContain("document:1:chunk:5")
    expect(Object.isFrozen(snapshot.value)).toBe(true)
    expect(Object.isFrozen(snapshot.value.chunks)).toBe(true)
  })

  it.each([
    ["mixed documents", [
      chunk(1),
      chunk(2, "other", { documentEvidenceRef: "document:2" }),
    ]],
    ["mixed budgets", [
      chunk(1),
      chunk(2, "other", { budgetFingerprint: `sha256:${"e".repeat(64)}` }),
    ]],
    ["forged content fingerprint", [
      chunk(1, "forged", { contentFingerprint: `sha256:${"f".repeat(64)}` }),
    ]],
  ] as const)("rejects %s before the LLM call", (_label, chunks) => {
    expect(createWebChunkSelectionSnapshot(chunks)).toMatchObject({ ok: false })
  })

  it.each([
    ["stale fingerprint", (fingerprint: string) => ({
      ...receipt(fingerprint),
      snapshotFingerprint: `sha256:${"e".repeat(64)}`,
    })],
    ["invented ref", (fingerprint: string) =>
      receipt(fingerprint, ["document:1:chunk:invented"])],
    ["duplicate ref", (fingerprint: string) =>
      receipt(fingerprint, ["document:1:chunk:1", "document:1:chunk:1"])],
    ["more than three", (fingerprint: string) =>
      receipt(fingerprint, [
        "document:1:chunk:1",
        "document:1:chunk:2",
        "document:1:chunk:3",
        "document:1:chunk:4",
      ])],
    ["raw content in receipt", (fingerprint: string) => ({
      ...receipt(fingerprint, ["document:1:chunk:1"]),
      selections: [{
        ...receipt(fingerprint, ["document:1:chunk:1"]).selections[0],
        content: "must not be copied",
      }],
    })],
    ["unknown fact", (fingerprint: string) => ({
      ...receipt(fingerprint, ["document:1:chunk:1"]),
      selections: [{
        ...receipt(fingerprint, ["document:1:chunk:1"]).selections[0],
        factKeys: ["invented_fact"],
      }],
    })],
  ])("rejects %s in the LLM receipt", async (_label, createReceipt) => {
    const snapshot = createWebChunkSelectionSnapshot([
      chunk(1), chunk(2), chunk(3), chunk(4),
    ])
    if (!snapshot.ok) throw new Error(snapshot.reasonCode)
    const port: WebChunkSelectionPort = {
      selectChunks: async () => createReceipt(snapshot.value.snapshotFingerprint),
    }

    expect(await selectWebResearchChunks({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      snapshot: snapshot.value,
    }, port)).toMatchObject({ ok: false })
  })
})
