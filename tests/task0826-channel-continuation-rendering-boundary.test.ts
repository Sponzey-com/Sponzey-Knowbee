import { describe, expect, it } from "vitest"
import {
  buildContinuationConfirmationNotice,
  type ChannelContinuationLookupCandidate,
} from "../packages/core/src/channels/continuation.ts"

const candidates: ChannelContinuationLookupCandidate[] = [
  {
    source: "explicit_run_id",
    runId: "run-1",
    requestGroupId: "group-1",
    confidence: "exact",
    createdAt: 10,
  },
  {
    source: "delivery_id",
    runId: "run-2",
    requestGroupId: "group-2",
    confidence: "exact",
    createdAt: 20,
  },
]

describe("task0826 channel continuation rendering boundary", () => {
  it("marks confirmation notice as requiring final response rendering", () => {
    expect(buildContinuationConfirmationNotice(candidates)).toMatchObject({
      kind: "channel_continuation_confirmation_required",
      candidateCount: 2,
      language: "en",
      deliveryMode: "receipt",
      textSource: "channel_continuation_control_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
