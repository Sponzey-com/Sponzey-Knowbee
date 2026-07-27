import type { UserFacingTextSource } from "./loop-directive.js"
import type { UserFacingResponseContentKind } from "./user-facing-response-gate.js"

export type TerminalControlKind = "awaiting_user" | "stop"

export interface TerminalControlNotice {
  kind: "terminal_control"
  terminalKind: TerminalControlKind
  messageSource: UserFacingTextSource
  deliveryMode: "control"
  textSource: "terminal_control_notice"
  renderingRequired: "llm_final_response"
  finalAnswer: false
  assistantIdentityClaim: false
  contentKind: UserFacingResponseContentKind
}

export function buildTerminalControlNotice(params: {
  terminalKind: TerminalControlKind
  messageSource: UserFacingTextSource
}): TerminalControlNotice {
  return {
    kind: "terminal_control",
    terminalKind: params.terminalKind,
    messageSource: params.messageSource,
    deliveryMode: "control",
    textSource: "terminal_control_notice",
    renderingRequired: "llm_final_response",
    finalAnswer: false,
    assistantIdentityClaim: false,
    contentKind: params.terminalKind === "stop" ? "validation_error" : "fixed_notice",
  }
}
