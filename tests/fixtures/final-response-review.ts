import type {
  FinalResponseRenderInput,
  FinalResponseRenderResult,
} from "../../packages/core/src/runs/final-response-renderer.ts"
import { buildLlmResponseReviewReceipt } from "../../packages/core/src/runs/user-facing-response-gate.ts"

export function buildReviewedFinalResponse(
  input: Pick<FinalResponseRenderInput, "rawText" | "textSource" | "contentKind">,
  responseText: string,
): FinalResponseRenderResult {
  const contentKind = input.contentKind ?? "fixed_notice"
  return {
    text: responseText,
    textSource: "llm_reviewed",
    promptSourceId: "final_response",
    rawTextSource: input.textSource,
    reviewReceipt: buildLlmResponseReviewReceipt({
      rawText: input.rawText,
      responseText,
      rawTextSource: input.textSource,
      contentKind,
    }),
  }
}
