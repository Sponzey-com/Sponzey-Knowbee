import { detectAvailableProvider, getDefaultModel, getProvider, } from "../ai/index.js";
import { loadMergedInstructions } from "../instructions/merge.js";
import { createLogger } from "../logger/index.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { chatWithContextPreflight } from "../runs/context-preflight.js";
import { buildUserProfilePromptContext } from "./profile-context.js";
export { aggregateSubSessionResultsForParent, buildParentAggregationRuntimeEvent, buildFeedbackRequest, collectResultReviewIssues, decideSubSessionCompletionIntegration, getSubAgentResultRetryBudgetLimit, normalizeResultReviewFailureKey, reviewSubAgentResult, summarizeChildResultForParent, } from "./sub-agent-result-review.js";
const log = createLogger("agent:completion-review");
export async function reviewTaskCompletion(params) {
    const originalRequest = params.originalRequest.trim();
    const latestAssistantMessage = params.latestAssistantMessage.trim();
    if (!originalRequest || !latestAssistantMessage)
        return null;
    const model = params.model ?? getDefaultModel();
    const providerId = params.providerId ?? detectAvailableProvider();
    const provider = params.provider ?? getProvider(providerId);
    const instructions = loadMergedInstructions(params.workDir ?? process.cwd());
    const profileContext = buildUserProfilePromptContext();
    const messages = [
        {
            role: "user",
            content: loadPromptTemplate({
                sourceId: "completion_review_user",
                workDir: params.workDir,
                variables: {
                    originalRequest,
                    priorAssistantMessagesBlock: params.priorAssistantMessages && params.priorAssistantMessages.length > 0
                        ? `Previously completed assistant results:\n${params.priorAssistantMessages.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
                        : "",
                    latestAssistantMessage,
                },
            }),
        },
    ];
    let raw = "";
    for await (const chunk of chatWithContextPreflight({
        provider,
        model,
        messages,
        system: [
            buildCompletionReviewSystemPrompt({ workDir: params.workDir }),
            instructions.mergedText ? `\n[Instruction Chain]\n${instructions.mergedText}` : "",
            profileContext ? `\n${profileContext}` : "",
        ].join("\n"),
        tools: [],
        signal: new AbortController().signal,
        metadata: { operation: "completion_review" },
    })) {
        if (chunk.type === "text_delta")
            raw += chunk.delta;
    }
    const parsed = parseCompletionReviewResult(raw);
    log.debug("completion review result", {
        providerId,
        model,
        parsed,
        rawPreview: raw.slice(0, 600),
    });
    return parsed;
}
export function buildCompletionReviewSystemPrompt(options = {}) {
    return loadPromptTemplate({
        sourceId: "completion_review",
        workDir: options.workDir,
        locale: options.locale ?? "en",
    });
}
export function parseCompletionReviewResult(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const jsonLike = extractJsonObject(trimmed);
    if (!jsonLike)
        return null;
    try {
        const parsed = JSON.parse(jsonLike);
        const status = normalizeStatus(parsed.status);
        if (!status)
            return null;
        return {
            status,
            summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
            reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
            ...(typeof parsed.followup_prompt === "string" && parsed.followup_prompt.trim()
                ? { followupPrompt: parsed.followup_prompt.trim() }
                : {}),
            ...(typeof parsed.user_message === "string" && parsed.user_message.trim()
                ? { userMessage: parsed.user_message.trim() }
                : {}),
            remainingItems: Array.isArray(parsed.remaining_items)
                ? parsed.remaining_items.filter((item) => typeof item === "string" && item.trim().length > 0)
                : [],
        };
    }
    catch {
        return null;
    }
}
function extractJsonObject(text) {
    const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start)
        return null;
    return withoutFence.slice(start, end + 1);
}
function normalizeStatus(value) {
    return value === "complete" || value === "followup" || value === "ask_user" ? value : null;
}
//# sourceMappingURL=completion-review.js.map