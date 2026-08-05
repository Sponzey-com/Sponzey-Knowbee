export type ChannelChunkErrorProvider = "slack" | "telegram"
export type ChannelChunkErrorLanguage = "ko" | "en"

export interface ChannelChunkErrorNotice {
  kind: "channel_chunk_error"
  provider: ChannelChunkErrorProvider
  stage: "chunk_delivery"
  language: ChannelChunkErrorLanguage
  reason: string
  text: string
  deliveryMode: "diagnostic"
  textSource: "channel_chunk_error_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildChannelChunkErrorNotice(input: {
  provider: ChannelChunkErrorProvider
  language?: ChannelChunkErrorLanguage | undefined
  reason: string
}): ChannelChunkErrorNotice {
  const language = input.language ?? "en"
  const reason = normalizeChannelChunkErrorReason(input.reason)
  return {
    kind: "channel_chunk_error",
    provider: input.provider,
    stage: "chunk_delivery",
    language,
    reason,
    text: language === "ko"
      ? `채널 실행 중 오류가 발생했습니다. 원인: ${reason}`
      : `Channel execution failed. Reason: ${reason}`,
    deliveryMode: "diagnostic",
    textSource: "channel_chunk_error_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

function normalizeChannelChunkErrorReason(reason: string): string {
  const normalized = reason.trim()
  return normalized.length > 0 ? normalized : "unknown error"
}
