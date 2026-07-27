import { getDefaultModel, getProvider } from "../ai/index.js";
import { renderFinalResponseText as renderFinalResponseTextDefault, } from "../runs/final-response-renderer.js";
import { userFacingTextSourceRequiresFinalResponseReview, } from "../runs/loop-directive.js";
export async function renderScheduledFinalResponse(params) {
    const rawText = params.rawText.trim();
    if (!rawText)
        return { status: "ready", text: "", textSource: params.textSource };
    if (!userFacingTextSourceRequiresFinalResponseReview(params.textSource)) {
        return { status: "ready", text: rawText, textSource: params.textSource };
    }
    if (!params.identityContext) {
        return {
            status: "blocked",
            error: "scheduled agent result requires final response identity context",
        };
    }
    const customRender = params.dependencies?.renderFinalResponseText;
    const model = params.model?.trim() || getDefaultModel(params.config);
    if (!model && !customRender) {
        return {
            status: "blocked",
            error: "scheduled agent result requires final response review but no AI model is configured",
        };
    }
    let provider;
    if (!customRender) {
        try {
            provider = getProvider(undefined, params.config);
        }
        catch {
            return {
                status: "blocked",
                error: "scheduled agent result requires final response review but no AI provider is configured",
            };
        }
    }
    const render = customRender ?? renderFinalResponseTextDefault;
    let rendered;
    try {
        rendered = await render({
            originalRequest: params.originalRequest,
            rawText,
            textSource: params.textSource,
            responseLanguageMode: params.responseLanguageMode ?? "same_as_request",
            model: model || undefined,
            ...(provider ? { provider } : {}),
            config: params.config,
            workDir: params.workDir,
            identityContext: params.identityContext,
        });
    }
    catch {
        rendered = null;
    }
    if (!rendered?.text.trim()) {
        return {
            status: "blocked",
            error: "scheduled agent result final response review failed",
        };
    }
    return {
        status: "ready",
        text: rendered.text,
        textSource: "llm_reviewed",
    };
}
//# sourceMappingURL=final-response.js.map