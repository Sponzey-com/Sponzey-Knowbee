import type { UserFacingTextSource } from "./loop-directive.js";
import type { UserFacingResponseContentKind } from "./user-facing-response-gate.js";
export type TerminalControlKind = "awaiting_user" | "stop";
export interface TerminalControlNotice {
    kind: "terminal_control";
    terminalKind: TerminalControlKind;
    messageSource: UserFacingTextSource;
    deliveryMode: "control";
    textSource: "terminal_control_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
    contentKind: UserFacingResponseContentKind;
}
export declare function buildTerminalControlNotice(params: {
    terminalKind: TerminalControlKind;
    messageSource: UserFacingTextSource;
}): TerminalControlNotice;
//# sourceMappingURL=terminal-control-notice.d.ts.map