import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import type { ToolResult } from "../packages/core/src/tools/types.ts"
import {
  projectValidatedWebToolResultForAgent,
  projectWebFetchResultForAgent,
  projectWebSearchResultForAgent,
} from "../packages/core/src/runs/web-evidence-agent-bridge.ts"

const rawSearchResult: ToolResult = {
  success: true,
  output: "RAW SEARCH MARKDOWN MUST NOT ESCAPE",
  details: {
    provider: "DuckDuckGo",
    results: [{ title: "Example", url: "https://example.com" }],
  },
}

describe("web evidence agent bridge", () => {
  it("validates one search result without running the legacy multi-stage LLM pipeline", () => {
    const sourceUrl = "https://example.com/current"
    const result = projectValidatedWebToolResultForAgent("web_search", {
      success: true,
      output: "RAW SEARCH MARKDOWN MUST NOT ESCAPE",
      details: {
        provider: "DuckDuckGo",
        retrievedAt: "2026-07-26T00:00:00.000Z",
        results: [{
          evidenceRef: "search:current",
          rank: 1,
          title: "Current report",
          url: sourceUrl,
          domain: "example.com",
          snippet: "Current value is 100.",
          sourceEvidence: {
            method: "fast_text_search",
            sourceKind: "search_index",
            reliability: "medium",
            sourceUrl,
            sourceDomain: "example.com",
            fetchTimestamp: "2026-07-26T00:00:00.000Z",
          },
        }],
      },
    })

    expect(result).toMatchObject({
      success: true,
      output: "",
      details: {
        kind: "web_search_evidence",
        resultCount: 1,
        results: [expect.objectContaining({
          evidenceRef: "search:current",
          url: sourceUrl,
          snippet: "Current value is 100.",
        })],
      },
    })
    expect(JSON.stringify(result)).not.toContain("RAW SEARCH MARKDOWN")
  })

  it("projects a sufficient pipeline result to a bounded agent ToolResult", async () => {
    const runPipeline = vi.fn(async () => ({
      ok: true as const,
      value: {
        packFingerprint: `sha256:${"a".repeat(64)}` as const,
        budgetFingerprint: `sha256:${"b".repeat(64)}` as const,
        status: "sufficient" as const,
        answerDraft: "SK hynix is trading at 123,000 KRW as of 10:20 KST.",
        supportedUnitRefs: ["unit:1"],
        unresolvedFactKeys: [],
      },
    }))

    const result = await projectWebSearchResultForAgent({
      requestGoal: "What is the current SK hynix price?",
      requiredFactKeys: ["current price", "quote time"],
      modelContextTokens: 8_000,
      systemToolText: "system and tools",
      conversationText: "conversation",
      searchResult: rawSearchResult,
      signal: new AbortController().signal,
    }, { runPipeline })

    expect(result).toEqual({
      success: true,
      output: "SK hynix is trading at 123,000 KRW as of 10:20 KST.",
      details: {
        kind: "web_evidence_verification",
        status: "sufficient",
        supportedEvidenceCount: 1,
        unresolvedFactKeys: [],
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/RAW SEARCH|packFingerprint|budgetFingerprint/u)
    expect(runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredFactKeys: ["current price", "quote time"],
        searchResult: rawSearchResult,
      }),
    )
  })

  it("returns a closed failure when evidence remains insufficient", async () => {
    const runPipeline = vi.fn(async () => ({
      ok: true as const,
      value: {
        packFingerprint: `sha256:${"a".repeat(64)}` as const,
        budgetFingerprint: `sha256:${"b".repeat(64)}` as const,
        status: "insufficient" as const,
        answerDraft: null,
        supportedUnitRefs: [],
        unresolvedFactKeys: ["quote time"],
      },
    }))

    const result = await projectWebSearchResultForAgent({
      requestGoal: "What is the current price?",
      requiredFactKeys: ["current price", "quote time"],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: rawSearchResult,
      signal: new AbortController().signal,
    }, { runPipeline })

    expect(result).toEqual({
      success: false,
      output: "",
      error: "web_evidence_insufficient",
      details: {
        kind: "web_evidence_verification",
        status: "insufficient",
        supportedEvidenceCount: 0,
        unresolvedFactKeys: ["quote time"],
      },
    })
    expect(JSON.stringify(result)).not.toContain("RAW SEARCH")
  })

  it("normalizes empty completion criteria without inspecting request semantics", async () => {
    const runPipeline = vi.fn(async () => ({
      ok: false as const,
      reasonCode: "web_evidence_pipeline_budget_failed" as const,
    }))

    const result = await projectWebSearchResultForAgent({
      requestGoal: "Research this.",
      requiredFactKeys: [],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: rawSearchResult,
      signal: new AbortController().signal,
    }, { runPipeline })

    expect(runPipeline.mock.calls[0]?.[0].requiredFactKeys).toEqual(["request_goal"])
    expect(result).toEqual({
      success: false,
      output: "",
      error: "web_evidence_pipeline_budget_failed",
      details: {
        kind: "web_evidence_pipeline_failure",
        reasonCode: "web_evidence_pipeline_budget_failed",
      },
    })
  })

  it("projects a direct fetch through the same bounded verification contract", async () => {
    const documentResult: ToolResult = {
      success: true,
      output: "RAW FETCH MARKDOWN MUST NOT ESCAPE",
      details: { document: { url: "https://example.com/direct" } },
    }
    const runPipeline = vi.fn(async () => ({
      ok: true as const,
      value: {
        packFingerprint: `sha256:${"a".repeat(64)}` as const,
        budgetFingerprint: `sha256:${"b".repeat(64)}` as const,
        status: "sufficient" as const,
        answerDraft: "Verified direct document answer.",
        supportedUnitRefs: ["unit:direct"],
        unresolvedFactKeys: [],
      },
    }))

    const result = await projectWebFetchResultForAgent({
      requestGoal: "Read this URL.",
      requiredFactKeys: [],
      modelContextTokens: 8_000,
      systemToolText: "system",
      conversationText: "conversation",
      documentResult,
      signal: new AbortController().signal,
    }, { runPipeline })

    expect(result).toEqual({
      success: true,
      output: "Verified direct document answer.",
      details: {
        kind: "web_evidence_verification",
        status: "sufficient",
        supportedEvidenceCount: 1,
        unresolvedFactKeys: [],
      },
    })
    expect(runPipeline.mock.calls[0]?.[0]).toMatchObject({
      requiredFactKeys: ["request_goal"],
      documentResult,
    })
    expect(JSON.stringify(result)).not.toContain("RAW FETCH")
  })

  it("does not invoke the pipeline after cancellation or a failed search", async () => {
    const runPipeline = vi.fn()
    const controller = new AbortController()
    controller.abort()

    expect(await projectWebSearchResultForAgent({
      requestGoal: "Research this.",
      requiredFactKeys: ["fact"],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: rawSearchResult,
      signal: controller.signal,
    }, { runPipeline })).toMatchObject({
      success: false,
      error: "web_evidence_pipeline_cancelled",
    })

    expect(await projectWebSearchResultForAgent({
      requestGoal: "Research this.",
      requiredFactKeys: ["fact"],
      modelContextTokens: 8_000,
      systemToolText: "",
      conversationText: "",
      searchResult: { success: false, output: "provider failed", error: "provider_failed" },
      signal: new AbortController().signal,
    }, { runPipeline })).toEqual({
      success: false,
      output: "",
      error: "provider_failed",
      details: {
        kind: "web_search_failure",
        reasonCode: "provider_failed",
      },
    })
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it("preserves a failed fetch as bounded partial-failure evidence", () => {
    const result = projectValidatedWebToolResultForAgent("web_fetch", {
      success: false,
      output: "RAW FAILED DOCUMENT token=private MUST NOT ESCAPE",
      error: "upstream_timeout",
      details: {
        sourceUrl: "https://private.example/document",
        rawResponse: "private response",
      },
    })

    expect(result).toEqual({
      success: false,
      output: "",
      error: "upstream_timeout",
      details: {
        kind: "web_fetch_failure",
        reasonCode: "upstream_timeout",
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/RAW FAILED|private\.example|rawResponse/iu)
  })

  it("keeps the production agent path on one bounded, single-review web execution owner", () => {
    const source = readFileSync(
      new URL("../packages/core/src/agent/index.ts", import.meta.url),
      "utf8",
    )

    expect(source).toContain("const canonicalWebEvidenceEnabled = allowWebAccess")
    expect(source).toContain(
      'tool.name === "web_search" || tool.name === "web_fetch"',
    )
    expect(source).toContain("web_evidence_search_already_executed")
    expect(source).toContain("admitInitialWebResearchMethod")
    expect(source).toContain("web_initial_method_admission_failure")
    const dispatchIndex = source.indexOf("const dispatchedResult")
    const projectionIndex = source.indexOf(
      "projectValidatedWebToolResultForAgent",
      dispatchIndex,
    )
    const publicYieldIndex = source.indexOf(
      'type: "tool_end"',
      projectionIndex,
    )
    expect(dispatchIndex).toBeGreaterThan(-1)
    expect(projectionIndex).toBeGreaterThan(dispatchIndex)
    expect(publicYieldIndex).toBeGreaterThan(projectionIndex)
    expect(source).not.toContain("webEvidenceRuntime.projectSearchResult")
    expect(source).not.toContain("webEvidenceRuntime.projectFetchResult")
  })
})
