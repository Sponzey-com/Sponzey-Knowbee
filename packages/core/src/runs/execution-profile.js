import { parseResponseLanguageMode, } from "../agent/intake.js";
import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { createRecoveryBudgetUsage } from "./recovery-budget.js";
const EXECUTION_FALLBACK_ORIGINAL_REQUEST_CONTEXT_SOURCE_ID = "execution_fallback_original_request_context_user";
export function buildResolvedExecutionProfile(params) {
    const executionSemantics = resolveExecutionSemantics(params);
    const structuredRequest = params.structuredRequest
        ?? (params.intentEnvelope ? buildStructuredRequestFromEnvelope(params.intentEnvelope) : undefined)
        ?? buildFallbackStructuredRequest(params.originalRequest?.trim() || params.message);
    const intentEnvelope = repairIntentEnvelope({
        intentEnvelope: params.intentEnvelope,
        structuredRequest,
        executionSemantics,
    });
    return {
        originalRequest: params.originalRequest?.trim() || params.message,
        structuredRequest: {
            ...structuredRequest,
            response_language_mode: parseResponseLanguageMode(structuredRequest.response_language_mode),
        },
        intentEnvelope: {
            ...intentEnvelope,
            response_language_mode: parseResponseLanguageMode(intentEnvelope.response_language_mode ?? structuredRequest.response_language_mode),
        },
        executionSemantics,
        requiresFilesystemMutation: executionSemantics.filesystemEffect === "mutate",
        requiresPrivilegedToolExecution: executionSemantics.privilegedOperation === "required",
        wantsDirectArtifactDelivery: executionSemantics.artifactDelivery === "direct",
        approvalRequired: executionSemantics.approvalRequired,
        approvalTool: executionSemantics.approvalTool,
        // Tool names are populated only from an admitted capability execution scope.
        // `needs_web` remains LLM intake evidence and never grants execution authority.
        requiredToolNames: [],
    };
}
export function normalizeDirectArtifactDeliverySemantics(params) {
    const executionSemantics = resolveExecutionSemantics(params);
    if (executionSemantics.artifactDelivery === "direct" &&
        executionSemantics.filesystemEffect === "none" &&
        executionSemantics.privilegedOperation === "none") {
        return {
            ...executionSemantics,
            artifactDelivery: "none",
        };
    }
    return executionSemantics;
}
export function createExecutionLoopRuntimeState(params) {
    const executionProfile = buildResolvedExecutionProfile(params);
    return {
        executionProfile,
        originalUserRequest: executionProfile.originalRequest,
        priorAssistantMessages: [],
        seenFollowupPrompts: new Set(),
        seenCommandFailureRecoveryKeys: new Set(),
        seenExecutionRecoveryKeys: new Set(),
        seenDeliveryRecoveryKeys: new Set(),
        seenAiRecoveryKeys: new Set(),
        recoveryBudgetUsage: createRecoveryBudgetUsage(),
        requiresFilesystemMutation: executionProfile.requiresFilesystemMutation,
        requiresPrivilegedToolExecution: executionProfile.requiresPrivilegedToolExecution,
        pendingToolParams: new Map(),
        filesystemMutationPaths: new Set(),
    };
}
function buildFallbackStructuredRequest(message) {
    const normalized = message.trim();
    const sourceLanguage = detectPrimaryMessageLanguage(normalized);
    return {
        ...buildDefaultTaskStructuredRequest(),
        source_language: sourceLanguage,
        response_language_mode: "same_as_request",
        normalized_english: normalized,
        target: normalized || loadPromptValue("execution_default_target_user", {}, { required: true }),
        to: loadPromptValue("execution_default_destination_user", {}, { required: true }),
        context: normalized
            ? [loadPromptValue(EXECUTION_FALLBACK_ORIGINAL_REQUEST_CONTEXT_SOURCE_ID, { originalRequest: normalized }, { required: true })]
            : [],
        complete_condition: [loadPromptValue("execution_default_complete_condition_user", {}, { required: true })],
    };
}
function buildDefaultTaskExecutionSemantics() {
    return {
        filesystemEffect: "none",
        privilegedOperation: "none",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "external_action",
    };
}
function buildDefaultTaskStructuredRequest() {
    return {
        source_language: "unknown",
        response_language_mode: "same_as_request",
        normalized_english: "",
        target: "",
        to: "",
        context: [],
        complete_condition: [],
    };
}
function buildStructuredRequestFromEnvelope(envelope) {
    return {
        source_language: envelope.source_language,
        response_language_mode: parseResponseLanguageMode(envelope.response_language_mode),
        normalized_english: envelope.normalized_english,
        target: envelope.target,
        to: envelope.destination,
        context: [...envelope.context],
        complete_condition: [...envelope.complete_condition],
    };
}
function buildFallbackIntentEnvelope(structuredRequest, executionSemantics) {
    return {
        intent_type: "task_intake",
        source_language: structuredRequest.source_language,
        response_language_mode: parseResponseLanguageMode(structuredRequest.response_language_mode),
        normalized_english: structuredRequest.normalized_english,
        target: structuredRequest.target,
        destination: structuredRequest.to,
        context: [...structuredRequest.context],
        complete_condition: [...structuredRequest.complete_condition],
        schedule_spec: {
            detected: false,
            kind: "none",
            status: "not_applicable",
            schedule_text: "",
        },
        execution_semantics: executionSemantics,
        delivery_mode: executionSemantics.artifactDelivery,
        requires_approval: executionSemantics.approvalRequired,
        approval_tool: executionSemantics.approvalTool,
        preferred_target: "auto",
        needs_tools: executionSemantics.filesystemEffect === "mutate" || executionSemantics.privilegedOperation === "required",
        needs_web: false,
    };
}
function resolveExecutionSemantics(params) {
    void params.message;
    void params.originalRequest;
    void params.structuredRequest;
    void params.intentEnvelope;
    return params.executionSemantics ?? buildDefaultTaskExecutionSemantics();
}
function repairIntentEnvelope(params) {
    if (!params.intentEnvelope) {
        return buildFallbackIntentEnvelope(params.structuredRequest, params.executionSemantics);
    }
    return {
        ...params.intentEnvelope,
        execution_semantics: params.executionSemantics,
        delivery_mode: params.executionSemantics.artifactDelivery,
    };
}
//# sourceMappingURL=execution-profile.js.map