import { describe, expect, it } from "vitest"
import { buildProgressMessageNotice } from "../packages/core/src/runs/progress-message-notice.ts"

describe("task0828 progress message rendering boundary", () => {
  it("marks progress messages as non-final notices requiring final response rendering", () => {
    expect(buildProgressMessageNotice()).toEqual({
      kind: "progress_message",
      deliveryMode: "progress",
      textSource: "progress_message_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
