import { describe, expect, it } from "vitest"
import {
  authorizeUserFacingResponse,
  buildLlmResponseReviewReceipt,
} from "../packages/core/src/runs/user-facing-response-gate.ts"

const rawText = "TOOL_RESULT: raw internal result"
const responseText = "요청한 작업 결과를 확인했습니다."

describe("task1213 LLM user-facing response receipt", () => {
  it.each([
    "tool_result",
    "sub_agent_result",
    "system_status",
    "validation_error",
    "fixed_notice",
  ] as const)("authorizes reviewed %s content with exact provenance", (contentKind) => {
    const receipt = buildLlmResponseReviewReceipt({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind,
    })
    expect(authorizeUserFacingResponse({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind,
      expectedLanguage: "ko",
      receipt,
    })).toEqual({ ok: true })
  })

  it("rejects raw delivery without a receipt and rejects altered content or source", () => {
    expect(authorizeUserFacingResponse({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind: "tool_result",
      expectedLanguage: "ko",
    })).toEqual({ ok: false, reasonCode: "review_receipt_missing" })

    const receipt = buildLlmResponseReviewReceipt({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind: "tool_result",
    })
    expect(authorizeUserFacingResponse({
      rawText,
      responseText: `${responseText} 변경`,
      rawTextSource: "runtime_deterministic",
      contentKind: "tool_result",
      expectedLanguage: "ko",
      receipt,
    }).reasonCode).toBe("review_content_mismatch")
    expect(authorizeUserFacingResponse({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind: "system_status",
      expectedLanguage: "ko",
      receipt,
    }).reasonCode).toBe("review_source_mismatch")
  })

  it("rejects a response whose reviewed language differs from the request language", () => {
    const receipt = buildLlmResponseReviewReceipt({
      rawText,
      responseText: "The work is complete.",
      rawTextSource: "runtime_deterministic",
      contentKind: "fixed_notice",
    })
    expect(authorizeUserFacingResponse({
      rawText,
      responseText: "The work is complete.",
      rawTextSource: "runtime_deterministic",
      contentKind: "fixed_notice",
      expectedLanguage: "ko",
      receipt,
    })).toEqual({ ok: false, reasonCode: "review_language_mismatch" })
  })
})
