import {
  createDuckDuckGoHtmlSearchAdapter,
  type DuckDuckGoHtmlSearchDependencies,
} from "../../adapters/duckduckgo-html-search.js"
import type { SourceFreshnessPolicy } from "../../contracts/web-retrieval.js"
import { createLogger } from "../../logger/index.js"
import type { AgentTool, ToolContext, ToolResult } from "../types.js"

const log = createLogger("tools:web-search")

interface WebSearchParams {
  query: string
  maxResults?: number
  locale?: string
  safeSearch?: "strict" | "moderate"
  freshnessPolicy?: SourceFreshnessPolicy
}

export function createWebSearchTool(
  dependencies: DuckDuckGoHtmlSearchDependencies = {},
): AgentTool<WebSearchParams> {
  const search = createDuckDuckGoHtmlSearchAdapter(dependencies)
  return {
    name: "web_search",
    evidenceSourceKind: "web",
    description: "Search the public web with DuckDuckGo and return Markdown evidence.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Result limit from 1 to 16" },
        locale: { type: "string", description: "Search locale such as ko-KR" },
        safeSearch: {
          type: "string",
          enum: ["strict", "moderate"],
          description: "Safe-search level",
        },
        freshnessPolicy: {
          type: "string",
          enum: ["normal", "latest_approximate", "strict_timestamp"],
          description: "Evidence freshness requirement for later LLM diagnosis",
        },
      },
      required: ["query"],
    },
    riskLevel: "safe",
    requiresApproval: false,
    async execute(params: WebSearchParams, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now()
      log.product("web_search_started", { runId: ctx.runId })
      const outcome = await search({
        query: params.query,
        locale: params.locale ?? "en-US",
        safeSearch: params.safeSearch ?? "moderate",
        maxResults: params.maxResults ?? 8,
        signal: ctx.signal,
      })
      if (!outcome.ok) {
        log.product("web_search_finished", {
          runId: ctx.runId,
          status: "failed",
          durationMs: Date.now() - startedAt,
        })
        log.fieldDebug("web_search_failed", {
          reasonCode: outcome.reasonCode,
          retryable: outcome.retryable,
        })
        return {
          success: false,
          output: "공개 웹 검색 결과를 가져오지 못했습니다.",
          error: outcome.reasonCode,
          details: { reasonCode: outcome.reasonCode, retryable: outcome.retryable },
        }
      }
      log.product("web_search_finished", {
        runId: ctx.runId,
        status: "succeeded",
        resultCount: outcome.results.length,
        durationMs: Date.now() - startedAt,
      })
      log.development("web_search_projection_created", {
        resultCount: outcome.results.length,
      })
      return {
        success: true,
        output: outcome.markdown,
        details: {
          provider: outcome.provider,
          retrievedAt: outcome.retrievedAt,
          results: outcome.results,
        },
      }
    },
  }
}

export const webSearchTool = createWebSearchTool()
