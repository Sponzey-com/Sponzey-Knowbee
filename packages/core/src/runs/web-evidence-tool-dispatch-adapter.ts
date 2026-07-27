import type { SourceFreshnessPolicy } from "../contracts/web-retrieval.js"
import type { ToolDispatcher } from "../tools/dispatcher.js"
import type { ToolContext, ToolResult } from "../tools/types.js"
import type { WebEvidenceSourceFetchPort } from "./web-evidence-pipeline.js"

type WebToolContext = ToolContext & { allowWebAccess: true }

function validPublicUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

function cancelled(): ToolResult {
  return {
    success: false,
    output: "",
    error: "web_document_cancelled",
    details: { reasonCode: "web_document_cancelled" },
  }
}

export function createWebEvidenceSourceFetchPort(input: Readonly<{
  dispatcher: Pick<ToolDispatcher, "dispatch">
  context: WebToolContext
  freshnessPolicy: SourceFreshnessPolicy
  onDispatchStarted?: (request: Readonly<{
    candidateRef: string
    url: string
  }>) => void
  onDispatchFinished?: (input: Readonly<{
    candidateRef: string
    url: string
    result: ToolResult
  }>) => void
}>): WebEvidenceSourceFetchPort {
  return async (request) => {
    if (
      request.signal.aborted ||
      input.context.signal?.aborted ||
      request.signal !== input.context.signal
    ) {
      return cancelled()
    }
    if (!request.candidateRef.trim() || !validPublicUrl(request.url)) {
      return {
        success: false,
        output: "",
        error: "web_document_evidence_invalid",
        details: { reasonCode: "web_document_evidence_invalid" },
      }
    }
    const dispatchInput = Object.freeze({
      candidateRef: request.candidateRef,
      url: request.url,
    })
    input.onDispatchStarted?.(dispatchInput)
    const result = await input.dispatcher.dispatch(
      "web_fetch",
      {
        url: request.url,
        maxLength: 200_000,
        freshnessPolicy: input.freshnessPolicy,
      },
      input.context,
    )
    input.onDispatchFinished?.(Object.freeze({ ...dispatchInput, result }))
    return result
  }
}
