export function buildTerminalControlNotice(params) {
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
    };
}
//# sourceMappingURL=terminal-control-notice.js.map