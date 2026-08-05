import { describe, expect, it } from "vitest"
import {
  buildContinuationConfirmationNotice,
  buildContinuationConfirmationPrompt,
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

describe("task0793 channel continuation confirmation notice", () => {
  it("builds structured control notice without hard-coded product identity", () => {
    const notice = buildContinuationConfirmationNotice(candidates)

    expect(notice).toEqual({
      kind: "channel_continuation_confirmation_required",
      candidateCount: 2,
      language: "en",
      text: "Found 2 possible previous contexts. Please choose which task to continue before this message is attached.",
      deliveryMode: "receipt",
      textSource: "channel_continuation_control_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
    expect(notice.text).not.toContain("Knowbee")
  })

  it("keeps the legacy prompt helper as notice text compatibility", () => {
    expect(buildContinuationConfirmationPrompt(candidates)).toBe(
      buildContinuationConfirmationNotice(candidates).text,
    )
  })
})
