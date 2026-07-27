import { buildMainAgentIdentityPromptContext, resolveMainAgentSelfName, resolvePromptLocaleForRequest, } from "../agent/main-agent-identity.js";
import { getProvider, } from "../ai/index.js";
import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { createLogger } from "../logger/index.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { authorizeUserFacingResponse, buildLlmResponseReviewReceipt, } from "./user-facing-response-gate.js";
const log = createLogger("runs:final-response");
function responseLanguageMatches(text, expected) {
    const detected = detectPrimaryMessageLanguage(text);
    return detected === "unknown" || detected === expected;
}
function preserveConfiguredMainAgentIdentityFact(input) {
    const configuredName = input.mainAgentSelfName.normalize("NFC").trim();
    if (!configuredName)
        return input.renderedText;
    const rawText = input.rawText.normalize("NFC");
    const renderedText = input.renderedText.normalize("NFC");
    return rawText.includes(configuredName) && !renderedText.includes(configuredName)
        ? input.rawText
        : input.renderedText;
}
function allowsAdditionalResponseLanguages(mode) {
    return mode === "translation" || mode === "language_comparison" || mode === "multilingual";
}
function extractJsonObject(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
function parseLanguageExceptionReview(text, requestedMode) {
    const json = extractJsonObject(text);
    if (!json)
        return false;
    try {
        const parsed = JSON.parse(json);
        return (parsed.allowed === true &&
            parsed.mode === requestedMode &&
            typeof parsed.reason === "string" &&
            parsed.reason.trim().length > 0);
    }
    catch {
        return false;
    }
}
async function reviewResponseLanguageMode(input) {
    const requestedMode = input.requestedMode ?? "same_as_request";
    if (!allowsAdditionalResponseLanguages(requestedMode))
        return "same_as_request";
    try {
        const system = loadPromptTemplate({
            sourceId: "response_language_exception_review",
            workDir: input.workDir,
        });
        const user = loadPromptTemplate({
            sourceId: "response_language_exception_review_user",
            workDir: input.workDir,
            variables: {
                originalRequestJson: JSON.stringify(input.originalRequest),
                requestedMode,
            },
        });
        let output = "";
        for await (const chunk of input.provider.chat({
            model: input.model,
            system,
            messages: [{ role: "user", content: user }],
            maxTokens: 300,
            ...(input.observability ? { observability: input.observability } : {}),
        })) {
            if (chunk.type === "text_delta")
                output += chunk.delta;
        }
        if (parseLanguageExceptionReview(output.trim(), requestedMode))
            return requestedMode;
    }
    catch {
        // Review failure narrows permission to the default single-language policy.
    }
    log.fieldDebug("response language exception rejected", {
        requestedMode,
        reasonCode: "explicit_request_unconfirmed",
    });
    return "same_as_request";
}
async function renderResponseAttempt(input) {
    const user = loadPromptTemplate({
        sourceId: "final_response_user",
        workDir: input.workDir,
        variables: {
            originalRequest: input.originalRequest,
            rawText: input.rawText,
            textSource: input.textSource,
        },
    });
    let output = "";
    for await (const chunk of input.provider.chat({
        model: input.model,
        system: input.system,
        messages: [{ role: "user", content: user }],
        maxTokens: 1200,
        ...(input.observability ? { observability: input.observability } : {}),
    })) {
        if (chunk.type === "text_delta")
            output += chunk.delta;
    }
    return output.trim();
}
export function finalResponseRenderProvenanceEvent(input) {
    return [
        `${input.eventPrefix}_provenance`,
        input.rendered.textSource ?? "llm_reviewed",
        input.rendered.promptSourceId ?? "final_response",
        input.rendered.rawTextSource ?? input.fallbackRawTextSource,
    ].join(":");
}
function resolveRenderProvider(input) {
    if (input.provider)
        return input.provider;
    const providerId = input.providerId?.trim();
    if (!providerId)
        return null;
    try {
        return getProvider(providerId, input.config);
    }
    catch {
        return null;
    }
}
export function buildFinalResponseIdentityContext(input) {
    const promptLocale = resolvePromptLocaleForRequest(input.config.profile.language, input.originalRequest);
    const mainAgentSelfName = resolveMainAgentSelfName(input.config, promptLocale);
    return {
        promptLocale,
        mainAgentSelfName,
        promptContext: buildMainAgentIdentityPromptContext(input.config, promptLocale, input.workDir),
    };
}
export async function renderFinalResponseText(input) {
    const model = input.model?.trim();
    const rawText = input.rawText.trim();
    const originalRequest = input.originalRequest.trim();
    if (!model || !rawText || !originalRequest)
        return null;
    const provider = resolveRenderProvider(input);
    if (!provider)
        return null;
    const identityContext = input.identityContext;
    if (!identityContext)
        return null;
    const responseLanguageMode = await reviewResponseLanguageMode({
        provider,
        model,
        requestedMode: input.responseLanguageMode,
        originalRequest,
        workDir: input.workDir,
        ...(input.runId || input.requestGroupId
            ? {
                observability: {
                    ...(input.runId ? { runId: input.runId } : {}),
                    ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
                    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                    stage: "final_response",
                    operationCode: "response_language_review",
                },
            }
            : {}),
    });
    const system = loadPromptTemplate({
        sourceId: "final_response",
        workDir: input.workDir,
    });
    const systemWithIdentity = [identityContext.promptContext, "\n", system].join("");
    let attemptRawText = rawText;
    let attemptTextSource = input.textSource;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const text = await renderResponseAttempt({
            provider,
            model,
            system: systemWithIdentity,
            originalRequest,
            rawText: attemptRawText,
            textSource: attemptTextSource,
            workDir: input.workDir,
            ...(input.runId || input.requestGroupId
                ? {
                    observability: {
                        ...(input.runId ? { runId: input.runId } : {}),
                        ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
                        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
                        stage: "final_response",
                        operationCode: attempt === 0 ? "final_response" : "final_response_repair",
                    },
                }
                : {}),
        });
        if (!text)
            return null;
        const identitySafeText = preserveConfiguredMainAgentIdentityFact({
            rawText: attemptRawText,
            renderedText: text,
            mainAgentSelfName: identityContext.mainAgentSelfName,
        });
        if (allowsAdditionalResponseLanguages(responseLanguageMode) ||
            responseLanguageMatches(identitySafeText, identityContext.promptLocale)) {
            const contentKind = input.contentKind ?? "fixed_notice";
            const reviewReceipt = buildLlmResponseReviewReceipt({
                rawText,
                responseText: identitySafeText,
                rawTextSource: input.textSource,
                contentKind,
            });
            const authorization = authorizeUserFacingResponse({
                rawText,
                responseText: identitySafeText,
                rawTextSource: input.textSource,
                contentKind,
                expectedLanguage: allowsAdditionalResponseLanguages(responseLanguageMode)
                    ? "unknown"
                    : identityContext.promptLocale,
                receipt: reviewReceipt,
            });
            if (!authorization.ok)
                return null;
            return {
                text: identitySafeText,
                textSource: "llm_reviewed",
                promptSourceId: "final_response",
                rawTextSource: input.textSource,
                reviewReceipt,
            };
        }
        log.fieldDebug("final response language mismatch", {
            expectedLanguage: identityContext.promptLocale,
            responseLanguageMode,
            attempt: attempt + 1,
        });
        attemptRawText = text;
        attemptTextSource = "llm_generated";
    }
    log.warn("Blocked final response after language validation failed", {
        expectedLanguage: identityContext.promptLocale,
        responseLanguageMode,
    });
    return null;
}
//# sourceMappingURL=final-response-renderer.js.map