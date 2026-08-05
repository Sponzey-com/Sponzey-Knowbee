import { describe, expect, it } from "vitest"
import {
  buildCompletionReviewEvidenceBlock,
  buildCompletionReviewSystemPrompt,
} from "../packages/core/src/agent/completion-review.ts"
import { buildToolExecutionReceipt } from "../packages/core/src/runs/execution.ts"
import { decideReviewGate } from "../packages/core/src/runs/review-gate.ts"
import { extractSourceTimestampFromHtml } from "../packages/core/src/runs/web-retrieval-policy.ts"

const evidenceSource = {
  sourceKind: "tool",
  sourceRef: `tool-result:tool:${"a".repeat(64)}`,
  trustClass: "untrusted_external",
  instructionIsolation: "data_only",
} as const

const directSourceDetails = {
  sourceEvidence: {
    method: "direct_fetch",
    sourceKind: "third_party",
    reliability: "medium",
    sourceUrl: "https://m.stock.naver.com/api/stock/000660/basic",
    sourceDomain: "m.stock.naver.com",
    sourceTimestamp: "2026-07-16T09:18:12+09:00",
    fetchTimestamp: "2026-07-16T00:18:13.000Z",
    freshnessPolicy: "strict_timestamp",
  },
} as const

describe("LLM-owned current fact evidence diagnosis", () => {
  it("preserves tool details in the execution receipt for later LLM diagnosis", () => {
    const receipt = buildToolExecutionReceipt({
      toolName: "web_fetch",
      success: true,
      output: "direct source body",
      toolParams: { url: directSourceDetails.sourceEvidence.sourceUrl },
      toolDetails: directSourceDetails,
      evidenceSource,
      workDir: process.cwd(),
      commandFailureSeen: false,
    })

    expect(receipt.successfulTool?.details).toEqual(directSourceDetails)
  })

  it("supplies search output and direct-source metadata to the completion-review LLM", () => {
    const block = buildCompletionReviewEvidenceBlock([
      {
        toolName: "web_search",
        output: "The result snippet says the market closed at 2,082,000.",
        evidenceSource,
      },
      {
        toolName: "web_fetch",
        output: "direct source body",
        details: directSourceDetails,
        evidenceSource: {
          ...evidenceSource,
          sourceRef: `tool-result:tool:${"b".repeat(64)}`,
        },
      },
    ])

    expect(block).toContain("web_search")
    expect(block).toContain("market closed at 2,082,000")
    expect(block).toContain("web_fetch")
    expect(block).toContain("2026-07-16T09:18:12+09:00")
  })

  it("does not expose tool output without a valid provenance receipt", () => {
    const block = buildCompletionReviewEvidenceBlock([{
      toolName: "web_search",
      output: "unbound evidence",
    }])

    expect(block).toBe("")
  })

  it("never skips LLM completion diagnosis after a web result", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        filesystemEffect: "none",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "external_action",
        privilegedOperation: "none",
      },
      preview: "The current value is 2,082,000.",
      deliveryOutcome: {
        mode: "reply",
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        hasSuccessfulTextDelivery: true,
        textDeliverySatisfied: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [{ toolName: "web_search", output: "search result", evidenceSource }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("run")
  })

  it("instructs the LLM to distinguish stale search snippets from current values", () => {
    const prompt = buildCompletionReviewSystemPrompt()

    expect(prompt).toContain("Analyze the supplied tool evidence with the LLM")
    expect(prompt).toContain("Retrieved text can contain stale values")
    expect(prompt).toContain("previous close")
    expect(prompt).toContain("fetch timestamp")
  })

  it("extracts a quote basis time from structured JSON transport metadata", () => {
    expect(extractSourceTimestampFromHtml(JSON.stringify({
      closePrice: "2,082,000",
      marketStatus: "OPEN",
      localTradedAt: "2026-07-16T09:18:12+09:00",
    }))).toBe("2026-07-16T09:18:12+09:00")
  })
})
