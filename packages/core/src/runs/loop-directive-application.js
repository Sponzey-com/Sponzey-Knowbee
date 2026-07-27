import { redactLogText } from "../logger/index.js";
import { finalResponseRenderProvenanceEvent, renderFinalResponseText, } from "./final-response-renderer.js";
import { buildAwaitingUserMessage, completeRunWithAssistantMessage, markRunCompleted, } from "./finalization.js";
import { userFacingTextSourceRequiresFinalResponseReview, } from "./loop-directive.js";
import { applyTerminalApplication } from "./terminal-application.js";
const defaultModuleDependencies = {
    completeRunWithAssistantMessage,
    markRunCompleted,
    applyTerminalApplication,
    renderFinalResponseText,
};
function hasFinalResponseContext(context) {
    return Boolean(context?.originalRequest.trim() &&
        context.workDir.trim() &&
        (context.provider || context.providerId?.trim()) &&
        context.model?.trim());
}
function shouldRewriteTerminalDirective(directive) {
    const source = resolveTerminalDirectiveTextSource(directive);
    return userFacingTextSourceRequiresFinalResponseReview(source);
}
function hasAppendedTerminalDirectiveText(directive) {
    return Boolean(directive.preview.trim() ||
        directive.reason?.trim() ||
        directive.remainingItems?.some((item) => item.trim()));
}
function resolveTerminalDirectiveTextSource(directive) {
    const source = directive.userMessageSource ?? "runtime_deterministic";
    if ((source === "llm_generated" || source === "llm_reviewed") &&
        hasAppendedTerminalDirectiveText(directive)) {
        return "mixed";
    }
    return source;
}
function safeRenderErrorDetail(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw).replace(/\s+/gu, " ").trim().slice(0, 240) || "renderer_error";
}
async function resolveTerminalDirectiveMessage(params) {
    const source = resolveTerminalDirectiveTextSource(params.directive);
    if (!shouldRewriteTerminalDirective(params.directive)) {
        return {
            ...(params.directive.userMessage ? { userMessage: params.directive.userMessage } : {}),
            userMessageSource: source,
        };
    }
    const responseContext = params.responseContext;
    if (!hasFinalResponseContext(responseContext)) {
        params.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_rewrite_blocked:missing_context`);
        return {
            userMessageSource: source,
        };
    }
    const rawText = buildAwaitingUserMessage({
        preview: params.directive.preview,
        summary: params.directive.summary,
        ...(params.directive.reason ? { reason: params.directive.reason } : {}),
        ...(params.directive.userMessage ? { userMessage: params.directive.userMessage } : {}),
        ...(params.directive.remainingItems ? { remainingItems: params.directive.remainingItems } : {}),
    });
    if (!rawText.trim()) {
        params.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_rewrite_blocked:empty_input`);
        return {
            userMessageSource: source,
        };
    }
    try {
        const rendered = await params.renderFinalResponseText({
            originalRequest: responseContext.originalRequest,
            ...(responseContext.responseLanguageMode
                ? { responseLanguageMode: responseContext.responseLanguageMode }
                : {}),
            rawText,
            textSource: source,
            model: responseContext.model,
            ...(responseContext.providerId ? { providerId: responseContext.providerId } : {}),
            ...(responseContext.provider ? { provider: responseContext.provider } : {}),
            config: responseContext.config,
            workDir: responseContext.workDir,
            ...(responseContext.identityContext
                ? { identityContext: responseContext.identityContext }
                : {}),
        });
        if (rendered?.text.trim()) {
            params.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_rewritten:llm`);
            params.appendRunEvent(params.runId, finalResponseRenderProvenanceEvent({
                eventPrefix: `user_facing_${params.directive.kind}`,
                rendered,
                fallbackRawTextSource: source,
            }));
            return {
                userMessage: rendered.text.trim(),
                userMessageSource: "llm_reviewed",
            };
        }
        params.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_rewrite_blocked:empty_output`);
    }
    catch (error) {
        const detail = safeRenderErrorDetail(error);
        params.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_rewrite_blocked:error:${detail}`);
    }
    return {
        userMessageSource: source,
    };
}
export async function applyLoopDirective(params, moduleDependencies = defaultModuleDependencies) {
    if (params.directive.eventLabel) {
        params.finalizationDependencies.appendRunEvent(params.runId, params.directive.eventLabel);
    }
    if (params.directive.kind === "complete") {
        if (params.directive.notice) {
            params.finalizationDependencies.appendRunEvent(params.runId, `user_facing_loop_directive_notice:${params.directive.notice.textSource}:non_final`);
        }
        params.finalizationDependencies.appendRunEvent(params.runId, `user_facing_text_source:${params.directive.textSource}`);
        params.finalizationDependencies.appendRunEvent(params.runId, hasFinalResponseContext(params.responseContext)
            ? "user_facing_response_context:available"
            : "user_facing_response_context:missing");
        await moduleDependencies.completeRunWithAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: params.directive.text,
            textSource: params.directive.textSource,
            ...(params.directive.responseReview
                ? { preauthorizedResponseReview: params.directive.responseReview }
                : {}),
            ...(params.responseContext ? { responseContext: params.responseContext } : {}),
            renderFinalResponseText: moduleDependencies.renderFinalResponseText,
            source: params.source,
            onChunk: params.onChunk,
            ...(params.suppressFinalDelivery ? { suppressFinalDelivery: true } : {}),
            ...(params.suppressFinalDeliveryReasonCode
                ? { suppressFinalDeliveryReasonCode: params.suppressFinalDeliveryReasonCode }
                : {}),
            dependencies: params.finalizationDependencies,
        });
        return "break";
    }
    if (params.directive.kind === "complete_silent") {
        moduleDependencies.markRunCompleted({
            runId: params.runId,
            sessionId: params.sessionId,
            source: params.source,
            text: "",
            summary: params.directive.summary,
            reviewingSummary: params.directive.summary,
            completedSummary: params.directive.summary,
            dependencies: params.finalizationDependencies,
        });
        return "break";
    }
    if (params.directive.kind === "retry_intake" || params.directive.kind === "execute") {
        throw new Error(`${params.directive.kind} directive must be handled inside the main loop before applyLoopDirective`);
    }
    const resolvedTerminalMessage = await resolveTerminalDirectiveMessage({
        directive: params.directive,
        responseContext: params.responseContext,
        runId: params.runId,
        appendRunEvent: params.finalizationDependencies.appendRunEvent,
        renderFinalResponseText: moduleDependencies.renderFinalResponseText,
    });
    await moduleDependencies.applyTerminalApplication({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        application: {
            kind: params.directive.kind,
            preview: params.directive.preview,
            summary: params.directive.summary,
            ...(params.directive.reason ? { reason: params.directive.reason } : {}),
            userMessageSource: resolvedTerminalMessage.userMessageSource,
            ...(resolvedTerminalMessage.userMessage
                ? { userMessage: resolvedTerminalMessage.userMessage }
                : {}),
            ...(params.directive.remainingItems
                ? { remainingItems: params.directive.remainingItems }
                : {}),
        },
        ...(params.responseContext ? { responseContext: params.responseContext } : {}),
        dependencies: params.finalizationDependencies,
    });
    params.finalizationDependencies.appendRunEvent(params.runId, `user_facing_${params.directive.kind}_message_source:${resolvedTerminalMessage.userMessageSource}`);
    return "break";
}
//# sourceMappingURL=loop-directive-application.js.map