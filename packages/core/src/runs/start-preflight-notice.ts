import type { StartPreflightFailure } from "./preflight.js"

export interface StartPreflightFailureNotice {
  kind: "start_preflight_failure"
  code: StartPreflightFailure["code"]
  summary: string
  deliveryMode: "diagnostic"
  textSource: "start_preflight_failure_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildStartPreflightFailureNotice(
  failure: StartPreflightFailure,
): StartPreflightFailureNotice {
  return {
    kind: "start_preflight_failure",
    code: failure.code,
    summary: normalizeStartPreflightSummary(failure.summary),
    deliveryMode: "diagnostic",
    textSource: "start_preflight_failure_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

function normalizeStartPreflightSummary(summary: string): string {
  const normalized = summary.trim()
  return normalized.length > 0 ? normalized : "Start preflight failed."
}
