import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildContinuationConfirmationNotice,
  resolveChannelContinuationNoticeLanguage,
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

describe("task0837 channel continuation confirmation language boundary", () => {
  it("resolves continuation notice language with English fallback", () => {
    expect(resolveChannelContinuationNoticeLanguage("ko")).toBe("ko")
    expect(resolveChannelContinuationNoticeLanguage("ko-KR")).toBe("ko")
    expect(resolveChannelContinuationNoticeLanguage("en")).toBe("en")
    expect(resolveChannelContinuationNoticeLanguage(undefined)).toBe("en")
  })

  it("builds Korean confirmation notice without changing non-final metadata", () => {
    expect(buildContinuationConfirmationNotice(candidates, { language: "ko" })).toEqual({
      kind: "channel_continuation_confirmation_required",
      candidateCount: 2,
      language: "ko",
      text: "이 메시지를 연결할 수 있는 이전 작업이 2개 있습니다. 어느 작업을 이어갈지 먼저 선택해 주세요.",
      deliveryMode: "receipt",
      textSource: "channel_continuation_control_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("passes Telegram inbound message language into continuation lookup", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/channels/telegram/bot.ts"), "utf-8")

    expect(source).toContain("const language = resolveTelegramInboundMessageLanguage(text)")
    expect(source).toContain("resolveChannelContinuation({\n        envelope: access.envelope,\n        language,")
    expect(source).not.toContain("resolveChannelContinuationNoticeLanguage(ctx.from?.language_code)")
  })
})
