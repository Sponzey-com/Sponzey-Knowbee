import { getDefaultModel, getProvider } from "../ai/index.js";
import { buildFinalResponseIdentityContext, renderFinalResponseText as renderFinalResponseTextDefault, } from "./final-response-renderer.js";
import { authorizeUserFacingResponse, } from "./user-facing-response-gate.js";
export async function renderUserFacingNoticeText(params) {
    const reasonPrefix = params.reasonPrefix?.trim() || "user_facing_notice";
    const rawText = params.rawText.trim();
    if (!rawText)
        return { status: "blocked", reason: `${reasonPrefix}_empty` };
    const explicitConfig = params.dependencies?.config;
    if (!explicitConfig)
        return { status: "blocked", reason: `${reasonPrefix}_config_missing` };
    const workDir = params.dependencies?.workDir?.trim()
        || explicitConfig?.profile.workspace.trim();
    if (!workDir)
        return { status: "blocked", reason: `${reasonPrefix}_work_dir_missing` };
    const identityContext = params.dependencies?.identityContext
        ?? (explicitConfig
            ? buildFinalResponseIdentityContext({
                config: explicitConfig,
                originalRequest: params.originalRequest,
                workDir,
            })
            : undefined);
    if (!identityContext)
        return { status: "blocked", reason: `${reasonPrefix}_identity_context_missing` };
    const model = params.dependencies?.getDefaultModel?.()
        ?? (explicitConfig ? getDefaultModel(explicitConfig) : "");
    if (!model.trim())
        return { status: "blocked", reason: `${reasonPrefix}_model_missing` };
    let provider;
    if (!params.dependencies?.renderFinalResponseText) {
        try {
            provider = params.dependencies?.getProvider?.()
                ?? (explicitConfig ? getProvider(undefined, explicitConfig) : undefined);
        }
        catch {
            return { status: "blocked", reason: `${reasonPrefix}_provider_missing` };
        }
    }
    const render = params.dependencies?.renderFinalResponseText ?? renderFinalResponseTextDefault;
    let rendered;
    try {
        rendered = await render({
            originalRequest: params.originalRequest,
            rawText,
            textSource: params.textSource ?? "runtime_deterministic",
            model,
            ...(provider ? { provider } : {}),
            config: explicitConfig,
            workDir,
            identityContext,
            contentKind: params.contentKind ?? "fixed_notice",
        });
    }
    catch {
        rendered = null;
    }
    const text = rendered?.text.trim();
    if (!text)
        return { status: "blocked", reason: `${reasonPrefix}_render_failed` };
    const rawTextSource = params.textSource ?? "runtime_deterministic";
    const contentKind = params.contentKind ?? "fixed_notice";
    const authorization = authorizeUserFacingResponse({
        rawText,
        responseText: text,
        rawTextSource,
        contentKind,
        expectedLanguage: identityContext.promptLocale,
        receipt: rendered?.reviewReceipt,
    });
    if (!authorization.ok) {
        return {
            status: "blocked",
            reason: `${reasonPrefix}_${authorization.reasonCode ?? "review_receipt_missing"}`,
        };
    }
    return {
        status: "ready",
        text,
        textSource: "llm_reviewed",
    };
}
//# sourceMappingURL=user-facing-notice-rendering.js.map