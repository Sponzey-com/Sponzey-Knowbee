import { describe, expect, it } from "vitest"
import {
  projectWebToolResultObservation,
} from "../packages/core/src/contracts/web-research-observation.ts"
import type { ToolResult } from "../packages/core/src/tools/types.ts"

const sourceEvidence = {
  method: "direct_fetch" as const,
  sourceKind: "third_party" as const,
  reliability: "medium" as const,
  sourceUrl: "https://example.com/report",
  sourceDomain: "example.com",
  sourceTimestamp: "2026-07-24T00:00:00.000Z",
  fetchTimestamp: "2026-07-24T01:00:00.000Z",
}

describe("web ToolResult typed observation projection", () => {
  it("projects bounded search metadata without copying the Markdown output", () => {
    const result: ToolResult = Object.freeze({
      success: true,
      output: "<!-- untrusted-web-evidence -->\n# full transport projection",
      details: Object.freeze({
        provider: "DuckDuckGo",
        retrievedAt: "2026-07-24T01:00:00.000Z",
        results: Object.freeze([
          Object.freeze({
            evidenceRef: "search:1",
            rank: 1,
            title: "Report",
            url: "https://example.com/report",
            domain: "example.com",
            snippet: "Current result summary.",
            sourceEvidence: Object.freeze({
              ...sourceEvidence,
              method: "fast_text_search" as const,
              sourceKind: "search_index" as const,
            }),
          }),
        ]),
      }),
    })

    const observation = projectWebToolResultObservation("web_search", result)

    expect(observation).toMatchObject({
      ok: true,
      value: {
        kind: "search_metadata",
        provider: "DuckDuckGo",
        resultCount: 1,
      },
    })
    expect(JSON.stringify(observation)).not.toContain("full transport projection")
  })

  it("projects the validated fetched document without mutating the ToolResult", () => {
    const document = Object.freeze({
      evidenceRef: "document:1",
      title: "Report",
      url: "https://example.com/report",
      markdown: "# Heading\n\nRelevant body.",
      truncated: false,
      sourceEvidence: Object.freeze(sourceEvidence),
    })
    const result: ToolResult = Object.freeze({
      success: true,
      output: "public-output-must-stay-unchanged",
      details: Object.freeze({ document, sourceEvidence, truncated: false }),
    })

    const observation = projectWebToolResultObservation("web_fetch", result)

    expect(observation).toEqual({
      ok: true,
      value: {
        kind: "document",
        document,
      },
    })
    expect(result.output).toBe("public-output-must-stay-unchanged")
  })

  it.each([
    ["web_search", { success: true, output: "x", details: { provider: "DuckDuckGo", retrievedAt: "bad", results: [] } }],
    ["web_search", {
      success: true,
      output: "x",
      details: {
        provider: "DuckDuckGo",
        retrievedAt: "2026-07-24T01:00:00.000Z",
        results: [
          { evidenceRef: "a", rank: 1, title: "A", url: "https://example.com/a", domain: "example.com", snippet: "", sourceEvidence: { ...sourceEvidence, sourceUrl: "https://example.com/a" } },
          { evidenceRef: "b", rank: 2, title: "B", url: "https://example.com/a", domain: "example.com", snippet: "", sourceEvidence: { ...sourceEvidence, sourceUrl: "https://example.com/a" } },
        ],
      },
    }],
    ["web_fetch", { success: true, output: "<html>raw</html>", details: { document: { markdown: "<html>raw</html>" } } }],
    ["web_fetch", {
      success: true,
      output: "must remain unchanged",
      details: {
        document: {
          evidenceRef: "document:oversized",
          title: "Oversized",
          url: "https://example.com/oversized",
          markdown: "x".repeat(200_001),
          truncated: true,
          sourceEvidence: {
            ...sourceEvidence,
            sourceUrl: "https://example.com/oversized",
          },
        },
      },
    }],
    ["web_fetch", { success: false, output: "failed", details: {} }],
  ] as const)("rejects malformed %s results", (toolName, result) => {
    expect(projectWebToolResultObservation(toolName, result)).toMatchObject({
      ok: false,
    })
  })
})
