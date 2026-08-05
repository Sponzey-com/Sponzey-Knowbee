import { sanitizeUserFacingError } from "./error-sanitizer.js";
import { decideFatalFailureTerminalOutcome } from "./terminal-outcome-policy.js";
export function applyFatalFailure(params, dependencies) {
    const terminalOutcome = decideFatalFailureTerminalOutcome({ aborted: params.aborted });
    const shouldAppendMessageEvent = !params.aborted || params.appendMessageEventOnAbort === true;
    const shouldAppendExtraEvents = !params.aborted || params.appendExtraEventsOnAbort === true;
    const userFacingMessage = (params.sanitizedError ?? sanitizeUserFacingError(params.message))
        .userMessage;
    if (shouldAppendMessageEvent) {
        dependencies.appendRunEvent(params.runId, userFacingMessage);
    }
    if (shouldAppendExtraEvents) {
        for (const event of params.extraEvents ?? []) {
            dependencies.appendRunEvent(params.runId, event);
        }
    }
    if (terminalOutcome === "cancelled") {
        dependencies.markAbortedRunCancelledIfActive(params.runId);
        return "cancelled";
    }
    dependencies.setRunStepStatus(params.runId, "executing", "failed", userFacingMessage);
    dependencies.updateRunStatus(params.runId, "failed", userFacingMessage, false);
    dependencies.rememberRunFailure({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        summary: params.summary,
        detail: userFacingMessage,
        title: params.title,
    });
    return "failed";
}
//# sourceMappingURL=failure-application.js.map