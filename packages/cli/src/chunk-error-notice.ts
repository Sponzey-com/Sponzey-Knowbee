export interface CliChunkErrorNotice {
  kind: "cli_chunk_error"
  surface: "cli"
  stage: "chunk_delivery"
  reason: string
  text: string
  deliveryMode: "diagnostic"
  textSource: "cli_chunk_error_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildCliChunkErrorNotice(input: {
  reason: string
}): CliChunkErrorNotice {
  const reason = normalizeCliChunkErrorReason(input.reason)
  return {
    kind: "cli_chunk_error",
    surface: "cli",
    stage: "chunk_delivery",
    reason,
    text: `Execution failed. Reason: ${reason}`,
    deliveryMode: "diagnostic",
    textSource: "cli_chunk_error_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

function normalizeCliChunkErrorReason(reason: string): string {
  const normalized = reason.trim()
  return normalized.length > 0 ? normalized : "unknown error"
}
