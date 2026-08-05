import { describe, expect, it } from "vitest"

import {
  authorizeUserFacingResponse,
  buildDirectLlmResponseReviewReceipt,
  buildLlmResponseReviewReceipt,
} from "../packages/core/src/runs/user-facing-response-gate.ts"

describe("direct response prompt provenance", () => {
  it("rejects a locally-built v1 receipt for a new direct answer", () => {
    const text = "안녕하세요."
    const receipt = buildLlmResponseReviewReceipt({
      rawText: text,
      responseText: text,
      rawTextSource: "llm_generated",
      contentKind: "direct_answer",
    })

    expect(authorizeUserFacingResponse({
      rawText: text,
      responseText: text,
      rawTextSource: "llm_generated",
      contentKind: "direct_answer",
      expectedLanguage: "ko",
      receipt,
    })).toEqual({
      ok: false,
      reasonCode: "review_provenance_missing",
    })
  })

  it("authorizes a direct answer bound to both prompt sources and an invocation", () => {
    const text = "안녕하세요."
    const receipt = buildDirectLlmResponseReviewReceipt({
      rawText: text,
      responseText: text,
      taskIntakePromptSha256: "a".repeat(64),
      finalResponsePromptSha256: "b".repeat(64),
      providerInvocationRef: "invocation:direct-1",
    })

    expect(authorizeUserFacingResponse({
      rawText: text,
      responseText: text,
      rawTextSource: "llm_generated",
      contentKind: "direct_answer",
      expectedLanguage: "ko",
      receipt,
    })).toEqual({ ok: true })
  })
})
