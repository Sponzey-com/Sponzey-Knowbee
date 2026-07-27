import { sanitizeUserFacingError } from "@knowbee/core/errors"

export type CliCommandErrorSeverity = "command" | "fatal"

export interface CliCommandErrorNotice {
  kind: "cli_command_error"
  surface: "cli"
  stage: "command"
  severity: CliCommandErrorSeverity
  reason: string
  text: string
  deliveryMode: "diagnostic"
  textSource: "cli_command_error_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
}

export function buildCliCommandErrorNotice(input: {
  severity: CliCommandErrorSeverity
  reason: string
}): CliCommandErrorNotice {
  const reason = normalizeCliCommandErrorReason(input.reason)
  const prefix = input.severity === "fatal"
    ? "CLI fatal failure"
    : "CLI command failed"

  return {
    kind: "cli_command_error",
    surface: "cli",
    stage: "command",
    severity: input.severity,
    reason,
    text: `${prefix}. Reason: ${reason}`,
    deliveryMode: "diagnostic",
    textSource: "cli_command_error_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
  }
}

export function formatCliCommandFailure(
  error: unknown,
  severity: CliCommandErrorSeverity = "command",
): string {
  const raw = error instanceof Error ? error.message : String(error)
  return buildCliCommandErrorNotice({
    severity,
    reason: sanitizeUserFacingError(raw).userMessage,
  }).text
}

export function reportCliCommandFailure(
  error: unknown,
  severity: CliCommandErrorSeverity = "command",
): never {
  console.error(formatCliCommandFailure(error, severity))
  process.exit(1)
}

function normalizeCliCommandErrorReason(reason: string): string {
  const normalized = reason.trim()
  return normalized.length > 0 ? normalized : "unknown error"
}
