import { sanitizeUserFacingError } from "@knowbee/core/errors"

export interface DaemonRejectionNotice {
  kind: "daemon_unhandled_rejection"
  surface: "daemon"
  stage: "runtime"
  reason: string
  text: string
  logLevel: "field_debug"
  textSource: "daemon_rejection_notice"
  renderingRequired: "none"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildDaemonRejectionNotice(input: {
  reason: string
}): DaemonRejectionNotice {
  const reason = normalizeDaemonRejectionReason(input.reason)
  return {
    kind: "daemon_unhandled_rejection",
    surface: "daemon",
    stage: "runtime",
    reason,
    text: `Daemon unhandled rejection; process kept alive. Reason: ${reason}`,
    logLevel: "field_debug",
    textSource: "daemon_rejection_notice",
    renderingRequired: "none",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

export function formatDaemonRejectionLog(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return buildDaemonRejectionNotice({
    reason: sanitizeUserFacingError(raw).userMessage,
  }).text
}

function normalizeDaemonRejectionReason(reason: string): string {
  const normalized = reason.trim()
  return normalized.length > 0 ? normalized : "unknown error"
}
