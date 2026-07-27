import { createHash } from "node:crypto";
const DEFAULT_SYSTEM_TOOL_TOKENS = 1_500;
const DEFAULT_CONVERSATION_TOKENS = 1_500;
const MINIMUM_ANSWER_RESERVE_TOKENS = 2_000;
const WEB_EVIDENCE_HARD_CAP_TOKENS = 12_000;
function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function isNonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function failure(reasonCode) {
    return Object.freeze({ ok: false, reasonCode });
}
function defaultAllocations(modelContextTokens, measuredSystemToolTokens, measuredConversationTokens) {
    const systemToolTokens = Math.max(DEFAULT_SYSTEM_TOOL_TOKENS, measuredSystemToolTokens);
    const conversationTokens = Math.max(DEFAULT_CONVERSATION_TOKENS, measuredConversationTokens);
    const availableForWeb = Math.max(0, modelContextTokens
        - systemToolTokens
        - conversationTokens
        - MINIMUM_ANSWER_RESERVE_TOKENS);
    return {
        systemToolTokens,
        conversationTokens,
        webEvidenceTokens: Math.min(WEB_EVIDENCE_HARD_CAP_TOKENS, availableForWeb),
        answerReserveTokens: MINIMUM_ANSWER_RESERVE_TOKENS,
    };
}
export function createWebResearchContextBudget(input, estimator) {
    if (!Number.isInteger(input.modelContextTokens) ||
        input.modelContextTokens <= 0 ||
        typeof input.systemToolText !== "string" ||
        typeof input.conversationText !== "string") {
        return failure("context_budget_input_invalid");
    }
    if (!estimator || typeof estimator.estimateTokens !== "function" || !estimator.version?.trim()) {
        return failure("context_budget_estimator_invalid");
    }
    let systemToolTokens;
    let conversationTokens;
    try {
        systemToolTokens = estimator.estimateTokens(input.systemToolText);
        conversationTokens = estimator.estimateTokens(input.conversationText);
    }
    catch {
        return failure("context_budget_estimator_invalid");
    }
    if (!isNonNegativeInteger(systemToolTokens) ||
        !isNonNegativeInteger(conversationTokens)) {
        return failure("context_budget_estimator_invalid");
    }
    const allocations = {
        ...defaultAllocations(input.modelContextTokens, systemToolTokens, conversationTokens),
        ...input.allocations,
    };
    if (!Object.values(allocations).every(isNonNegativeInteger)) {
        return failure("context_budget_allocation_invalid");
    }
    if (allocations.webEvidenceTokens > WEB_EVIDENCE_HARD_CAP_TOKENS) {
        return failure("context_budget_web_cap_exceeded");
    }
    if (allocations.answerReserveTokens < MINIMUM_ANSWER_RESERVE_TOKENS) {
        return failure("context_budget_answer_reserve_too_small");
    }
    if (systemToolTokens > allocations.systemToolTokens ||
        conversationTokens > allocations.conversationTokens) {
        return failure("context_budget_input_exceeds_allocation");
    }
    const allocatedTokens = Object.values(allocations).reduce((total, value) => total + value, 0);
    if (allocatedTokens > input.modelContextTokens) {
        return failure("context_budget_total_exceeded");
    }
    const inputFingerprint = sha256(JSON.stringify({
        systemToolText: input.systemToolText,
        conversationText: input.conversationText,
    }));
    const frozenAllocations = Object.freeze({ ...allocations });
    const estimatedUse = Object.freeze({ systemToolTokens, conversationTokens });
    const stableBudget = {
        modelContextTokens: input.modelContextTokens,
        allocations: frozenAllocations,
        estimatedUse,
        unallocatedTokens: input.modelContextTokens - allocatedTokens,
        estimatorVersion: estimator.version.trim(),
        inputFingerprint,
    };
    const fingerprint = sha256(JSON.stringify(stableBudget));
    return Object.freeze({
        ok: true,
        value: Object.freeze({ ...stableBudget, fingerprint }),
    });
}
//# sourceMappingURL=web-research-context-budget.js.map