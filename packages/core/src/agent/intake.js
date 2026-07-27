import { detectAvailableProvider, getDefaultModel, getProvider } from "../ai/index.js";
import { collectStructuredToolAttempt, } from "../ai/structured-tool-attempt.js";
import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { parseTelegramSessionKey } from "../channels/telegram/session.js";
import { getMessages, getMessagesForRequestGroupWithRunMeta, getSession, } from "../db/index.js";
import { loadMergedInstructions } from "../instructions/merge.js";
import { createLogger } from "../logger/index.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { getMqttExtensionSnapshots } from "../mqtt/broker.js";
import { chatWithContextPreflight } from "../runs/context-preflight.js";
import { validateConversationDecision } from "./conversation-decision.js";
import { validateIdentityClaim } from "./identity-claim.js";
import { validateIntakeDecisionConsistency } from "./intake-decision.js";
import { extractIntakeMethodConstraints } from "./intake-method-constraints.js";
import { buildTaskIntakeFirstResponsePromptAssembly } from "./intake-prompt.js";
import { TASK_INTAKE_RESPONSE_TOOL, TASK_INTAKE_RESPONSE_TOOL_NAME, } from "./intake-response-tool.js";
import { isTaskIntakeIntentCategory, } from "./intake-category.js";
import { buildMainAgentIdentityPromptContext, KNOWBEE_PRODUCT_NAME, KNOWBEE_PRODUCT_NAME_KO, resolveMainAgentSelfName, resolvePromptLocaleForRequest, } from "./main-agent-identity.js";
import { buildUserProfilePromptContext, resolveUserProfileName } from "./profile-context.js";
import { selectRequestGroupContextMessages } from "./request-group-context.js";
import { normalizeRequestForIntake } from "./request-normalizer.js";
const log = createLogger("agent:intake");
const TASK_INTAKE_OPERATION_TIMEOUT_MS = 60_000;
export const LLM_INTAKE_RESULT_NOTE = "llm-intake-result";
const INTAKE_COMPLETE_CONDITION_SOURCE_IDS = {
    scheduleSaved: "intake_complete_condition_schedule_saved_user",
    scheduleTimingMatches: "intake_complete_condition_schedule_timing_matches_user",
    scheduleTimingPreserved: "intake_complete_condition_schedule_timing_preserved_user",
    cancelSchedule: "intake_complete_condition_cancel_schedule_user",
    missingInfoCollected: "intake_complete_condition_missing_info_collected_user",
    replyDestination: "intake_complete_condition_reply_destination_user",
    scheduleRegistered: "intake_complete_condition_schedule_registered_user",
    clarificationRequested: "intake_complete_condition_clarification_requested_user",
    defaultResult: "intake_complete_condition_default_result_user",
};
const INTAKE_CONVERSATION_CONTEXT_LABELS_SOURCE_ID = "intake_conversation_context_labels_user";
const AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID = "agent_runtime_prompt_context_labels_user";
export function defaultTaskExecutionSemantics() {
    return {
        filesystemEffect: "none",
        privilegedOperation: "none",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "external_action",
    };
}
export function defaultTaskStructuredRequest() {
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
export function parseResponseLanguageMode(value) {
    if (value === "translation" || value === "language_comparison" || value === "multilingual")
        return value;
    return "same_as_request";
}
export function parseTaskExecutionSemantics(value) {
    if (!value || typeof value !== "object")
        return defaultTaskExecutionSemantics();
    const record = value;
    return {
        filesystemEffect: record.filesystem_effect === "mutate" ? "mutate" : "none",
        privilegedOperation: record.privileged_operation === "required" ? "required" : "none",
        artifactDelivery: record.artifact_delivery === "direct" ? "direct" : "none",
        approvalRequired: record.approval_required === true,
        approvalTool: isApprovalToolName(record.approval_tool)
            ? record.approval_tool
            : "external_action",
    };
}
function inferStructuredRequestLanguage(text) {
    return detectPrimaryMessageLanguage(text);
}
function normalizeStructuredText(value) {
    return value.trim().replace(/\s+/gu, " ");
}
function getString(value) {
    return typeof value === "string" ? value : undefined;
}
function normalizeStructuredList(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => typeof item === "string")
        .map((item) => normalizeStructuredText(item))
        .filter(Boolean);
}
function getLiteralDeliveryText(payload) {
    const direct = getString(payload.literal_text) ?? getString(payload.literalText);
    if (direct?.trim())
        return direct.trim();
    const followup = payload.followup_run_payload;
    if (!followup || typeof followup !== "object" || Array.isArray(followup))
        return null;
    const nested = followup;
    const nestedValue = getString(nested.literal_text) ?? getString(nested.literalText);
    return nestedValue?.trim() || null;
}
function buildStructuredRequestEnvironment(sessionId, source) {
    const session = sessionId ? getSession(sessionId) : undefined;
    const resolvedSource = session?.source ?? source ?? "unknown";
    if (resolvedSource === "telegram") {
        const parsed = session?.source_id ? parseTelegramSessionKey(session.source_id) : null;
        if (parsed) {
            const destination = parsed.threadId !== undefined
                ? `telegram chat ${parsed.chatId}, thread ${parsed.threadId}`
                : `telegram chat ${parsed.chatId}, main thread`;
            return {
                destination,
                contextLines: [
                    `Delivery destination: ${destination}`,
                    `Execution channel: telegram session ${sessionId ?? "unknown"}`,
                ],
            };
        }
        return {
            destination: `telegram session ${sessionId ?? "unknown"}`,
            contextLines: [`Execution channel: telegram session ${sessionId ?? "unknown"}`],
        };
    }
    if (resolvedSource === "webui") {
        return {
            destination: `webui session ${sessionId ?? "unknown"}`,
            contextLines: [`Execution channel: webui session ${sessionId ?? "unknown"}`],
        };
    }
    if (resolvedSource === "slack") {
        return {
            destination: `slack session ${sessionId ?? "unknown"}`,
            contextLines: [`Execution channel: slack session ${sessionId ?? "unknown"}`],
        };
    }
    if (resolvedSource === "cli") {
        return {
            destination: `cli session ${sessionId ?? "unknown"}`,
            contextLines: [`Execution channel: cli session ${sessionId ?? "unknown"}`],
        };
    }
    if (sessionId) {
        return {
            destination: `session ${sessionId}`,
            contextLines: [`Execution channel: session ${sessionId}`],
        };
    }
    return {
        destination: "the active session destination",
        contextLines: ["Execution channel: active session destination"],
    };
}
function buildNormalizedEnglishSummary(request) {
    return [
        `Target: ${request.target}`,
        request.to ? `To: ${request.to}` : "",
        request.context.length > 0 ? `Context: ${request.context.join(" | ")}` : "",
        request.complete_condition.length > 0
            ? `Complete condition: ${request.complete_condition.join(" | ")}`
            : "",
    ]
        .filter(Boolean)
        .join("\n");
}
function inferStructuredRequestTarget(userMessage, intentSummary, actionItems) {
    for (const action of actionItems) {
        const payload = action.payload;
        const literalDeliveryCandidate = getLiteralDeliveryText(payload);
        if (literalDeliveryCandidate) {
            return `Deliver the exact literal text "${literalDeliveryCandidate.trim()}".`;
        }
        const candidates = [
            getString(payload.goal),
            getString(payload.task),
            getString(payload.question),
            getString(payload.content),
            action.title,
        ]
            .map((value) => (typeof value === "string" ? normalizeStructuredText(value) : ""))
            .filter(Boolean);
        const firstCandidate = candidates[0];
        if (firstCandidate)
            return firstCandidate;
    }
    return normalizeStructuredText(intentSummary || userMessage);
}
function inferStructuredRequestTo(actionItems, scheduling, execution, environment) {
    const replyAction = actionItems.find((action) => action.type === "reply");
    const createScheduleAction = actionItems.find((action) => action.type === "create_schedule");
    if (replyAction) {
        return environment.destination;
    }
    if (createScheduleAction) {
        const literalDeliveryCandidate = getLiteralDeliveryText(createScheduleAction.payload);
        if (literalDeliveryCandidate) {
            return `${environment.destination} at the scheduled time`;
        }
    }
    if (execution.execution_semantics.artifactDelivery === "direct") {
        return environment.destination;
    }
    if (actionItems.some((action) => action.type === "ask_user")) {
        return `the user in ${environment.destination}`;
    }
    if (scheduling.detected) {
        return `${environment.destination} at the scheduled time`;
    }
    return "the current execution target";
}
function inferStructuredRequestContext(userMessage, actionItems, scheduling, environment) {
    const contexts = [...environment.contextLines];
    const conversationContext = normalizeStructuredText(userMessage);
    if (conversationContext) {
        contexts.push(`${intakeConversationContextLabel("original_user_request")} ${conversationContext}`);
    }
    for (const action of actionItems) {
        const payload = action.payload;
        const payloadContext = getString(payload.context);
        if (payloadContext) {
            contexts.push(normalizeStructuredText(payloadContext));
        }
    }
    if (scheduling.detected) {
        const scheduleParts = [
            scheduling.kind !== "none" ? `Schedule kind: ${scheduling.kind}` : "",
            scheduling.schedule_text
                ? `Schedule: ${normalizeStructuredText(scheduling.schedule_text)}`
                : "",
            scheduling.run_at ? `Run at: ${normalizeStructuredText(scheduling.run_at)}` : "",
            scheduling.cron ? `Cron: ${normalizeStructuredText(scheduling.cron)}` : "",
        ]
            .filter(Boolean)
            .join(" | ");
        if (scheduleParts) {
            contexts.push(scheduleParts);
        }
    }
    return Array.from(new Set(contexts));
}
export function inferStructuredRequestCompleteCondition(intent, actionItems, scheduling, environment) {
    for (const action of actionItems) {
        const payloadConditions = normalizeStructuredList(action.payload.success_criteria);
        if (payloadConditions.length > 0)
            return payloadConditions;
    }
    if (actionItems.some((action) => action.type === "create_schedule")) {
        return [
            intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.scheduleSaved),
            scheduling.schedule_text
                ? intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.scheduleTimingMatches, {
                    scheduleText: normalizeStructuredText(scheduling.schedule_text),
                })
                : intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.scheduleTimingPreserved),
        ];
    }
    if (actionItems.some((action) => action.type === "cancel_schedule")) {
        return [intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.cancelSchedule)];
    }
    if (actionItems.some((action) => action.type === "ask_user")) {
        return [intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.missingInfoCollected)];
    }
    if (actionItems.some((action) => action.type === "reply")) {
        return [
            intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.replyDestination, {
                destination: environment.destination,
            }),
        ];
    }
    if (intent.category === "schedule_request") {
        return [intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.scheduleRegistered)];
    }
    if (intent.category === "clarification") {
        return [intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.clarificationRequested)];
    }
    return [
        intakeCompletionCondition(INTAKE_COMPLETE_CONDITION_SOURCE_IDS.defaultResult, {
            destination: environment.destination,
        }),
    ];
}
function intakeCompletionCondition(sourceId, variables = {}) {
    return loadPromptValue(sourceId, variables, { required: true });
}
function intakeConversationContextLabel(key) {
    const entries = loadPromptValue(INTAKE_CONVERSATION_CONTEXT_LABELS_SOURCE_ID, {}, { required: true })
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0)
            return [line, ""];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
    const value = new Map(entries).get(key);
    if (!value)
        throw new Error(`intake conversation context label missing: ${key}`);
    return value;
}
function agentRuntimePromptContextLabel(key, variables = {}) {
    const entries = loadPromptValue(AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID, variables, {
        required: true,
    })
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0)
            return [line, ""];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
    const value = new Map(entries).get(key);
    if (!value)
        throw new Error(`agent runtime prompt context label missing: ${key}`);
    return value;
}
function finalizeStructuredArtifacts(params) {
    const notes = [...params.result.notes];
    const repairedFields = [];
    const normalizedEnglish = normalizeStructuredText(params.structuredRequest.normalized_english) ||
        params.normalized?.normalizedEnglish ||
        buildNormalizedEnglishSummary(params.structuredRequest);
    if (!normalizeStructuredText(params.structuredRequest.normalized_english)) {
        repairedFields.push("normalized_english");
    }
    const target = normalizeStructuredText(params.structuredRequest.target) ||
        inferStructuredRequestTarget(params.userMessage, params.result.intent.summary, params.result.action_items);
    if (!normalizeStructuredText(params.structuredRequest.target)) {
        repairedFields.push("target");
    }
    const destination = normalizeStructuredText(params.structuredRequest.to) ||
        inferStructuredRequestTo(params.result.action_items, params.result.scheduling, params.result.execution, params.environment);
    if (!normalizeStructuredText(params.structuredRequest.to)) {
        repairedFields.push("destination");
    }
    const context = params.structuredRequest.context.length > 0
        ? params.structuredRequest.context
        : inferStructuredRequestContext(params.userMessage, params.result.action_items, params.result.scheduling, params.environment);
    if (params.structuredRequest.context.length === 0) {
        repairedFields.push("context");
    }
    const completeCondition = params.structuredRequest.complete_condition.length > 0
        ? params.structuredRequest.complete_condition
        : inferStructuredRequestCompleteCondition(params.result.intent, params.result.action_items, params.result.scheduling, params.environment);
    if (params.structuredRequest.complete_condition.length === 0) {
        repairedFields.push("complete_condition");
    }
    const structuredRequest = {
        source_language: params.structuredRequest.source_language,
        response_language_mode: parseResponseLanguageMode(params.structuredRequest.response_language_mode),
        normalized_english: normalizedEnglish,
        target,
        to: destination,
        context,
        complete_condition: completeCondition,
    };
    const intentEnvelope = buildTaskIntentEnvelope(params.result, structuredRequest);
    if (repairedFields.length > 0) {
        notes.push(`intent-envelope-repaired:${repairedFields.join(",")}`);
    }
    notes.push("intent-envelope-validated");
    return {
        structuredRequest,
        intentEnvelope,
        notes: Array.from(new Set(notes)),
    };
}
export function promotePromissoryDirectAnswer(result, latestUserMessage) {
    const shouldPromote = result.intent.category === "direct_answer" &&
        result.user_message.mode === "direct_answer" &&
        (result.execution.requires_run ||
            result.execution.requires_delegation ||
            result.execution.needs_tools ||
            result.execution.needs_web);
    if (!shouldPromote)
        return result;
    const retainedActions = result.action_items.filter((item) => item.type !== "reply");
    const actionItems = retainedActions.length > 0
        ? retainedActions
        : [
            {
                id: "run-task-promoted-from-intake",
                type: "run_task",
                title: result.structured_request.target || result.intent.summary || "요청 실행",
                priority: "normal",
                reason: "직접 답변이 아니라 실제 후속 실행이 필요한 요청입니다.",
                payload: {
                    goal: result.structured_request.normalized_english ||
                        result.structured_request.target ||
                        result.intent.summary,
                    context: result.structured_request.context.join("\n"),
                    task_profile: "general_chat",
                    preferred_target: result.execution.suggested_target || "auto",
                    success_criteria: result.structured_request.complete_condition,
                    constraints: [],
                },
            },
        ];
    return {
        ...result,
        intent: {
            ...result.intent,
            category: "task_intake",
        },
        user_message: {
            mode: "accepted_receipt",
            text: result.user_message.text,
        },
        action_items: actionItems,
        execution: {
            ...result.execution,
            requires_run: true,
            needs_web: result.execution.needs_web,
        },
        notes: Array.from(new Set([...result.notes, "promissory-direct-answer-promoted"])),
    };
}
function buildTaskIntentEnvelope(result, structuredRequest) {
    return {
        intent_type: result.intent.category,
        source_language: structuredRequest.source_language,
        response_language_mode: parseResponseLanguageMode(structuredRequest.response_language_mode),
        normalized_english: structuredRequest.normalized_english,
        target: structuredRequest.target,
        destination: structuredRequest.to,
        context: structuredRequest.context,
        complete_condition: structuredRequest.complete_condition,
        schedule_spec: result.scheduling,
        execution_semantics: result.execution.execution_semantics,
        delivery_mode: result.execution.execution_semantics.artifactDelivery,
        requires_approval: result.execution.execution_semantics.approvalRequired,
        approval_tool: result.execution.execution_semantics.approvalTool,
        preferred_target: result.execution.suggested_target,
        needs_tools: result.execution.needs_tools,
        needs_web: result.execution.needs_web,
    };
}
function conversationDecisionForIntake(result) {
    const clarificationAction = result.action_items.find((item) => item.type === "ask_user");
    const assumptions = result.action_items.flatMap((item) => Array.isArray(item.payload.assumptions)
        ? item.payload.assumptions.filter((value) => typeof value === "string")
        : []);
    const constraints = result.action_items.flatMap((item) => Array.isArray(item.payload.constraints)
        ? item.payload.constraints.filter((value) => typeof value === "string")
        : []);
    const missingFields = Array.isArray(clarificationAction?.payload.missing_fields)
        ? clarificationAction.payload.missing_fields.filter((value) => typeof value === "string")
        : [];
    const isDirect = result.intent.category === "direct_answer";
    const ambiguityImpact = result.intent.category === "clarification"
        ? "high_impact"
        : assumptions.length > 0
            ? "low_impact"
            : "none";
    return {
        requestKind: isDirect ? "simple_question" : "work_request",
        goal: result.structured_request.target || result.intent.summary,
        constraints,
        availableContext: [...result.structured_request.context],
        requiredTools: [
            ...(result.execution.needs_tools ? ["tool"] : []),
            ...(result.execution.needs_web ? ["web"] : []),
            ...(result.execution.requires_delegation ? ["sub_agent"] : []),
        ],
        ambiguity: {
            impact: ambiguityImpact,
            missingFields,
            assumptions,
        },
        selectedAction: result.intent.category === "clarification"
            ? "ask_clarification"
            : isDirect
                ? "direct_answer"
                : "plan_work",
        ...(typeof clarificationAction?.payload.question === "string"
            ? { clarificationQuestion: clarificationAction.payload.question }
            : {}),
    };
}
function synthesizeStructuredRequest(userMessage, result, environment, normalized) {
    const base = {
        source_language: normalized?.sourceLanguage ?? inferStructuredRequestLanguage(userMessage),
        response_language_mode: "same_as_request",
        target: inferStructuredRequestTarget(userMessage, result.intent.summary, result.action_items),
        to: inferStructuredRequestTo(result.action_items, result.scheduling, result.execution, environment),
        context: inferStructuredRequestContext(userMessage, result.action_items, result.scheduling, environment),
        complete_condition: inferStructuredRequestCompleteCondition(result.intent, result.action_items, result.scheduling, environment),
    };
    return {
        ...base,
        normalized_english: normalized?.normalizedEnglish || buildNormalizedEnglishSummary(base),
    };
}
function parseTaskStructuredRequest(value, fallbackUserMessage, fallbackResult, environment, normalized) {
    if (!value || typeof value !== "object") {
        return synthesizeStructuredRequest(fallbackUserMessage, fallbackResult, environment, normalized);
    }
    const record = value;
    const sourceLanguage = isStructuredRequestLanguage(record.source_language)
        ? record.source_language
        : (normalized?.sourceLanguage ?? inferStructuredRequestLanguage(fallbackUserMessage));
    const target = normalizeStructuredText(typeof record.target === "string" ? record.target : "");
    const to = normalizeStructuredText(typeof record.to === "string" ? record.to : "");
    const context = normalizeStructuredList(record.context);
    const completeCondition = normalizeStructuredList(record.complete_condition);
    const request = {
        source_language: sourceLanguage,
        response_language_mode: parseResponseLanguageMode(record.response_language_mode),
        target: target ||
            inferStructuredRequestTarget(fallbackUserMessage, fallbackResult.intent.summary, fallbackResult.action_items),
        to: to ||
            inferStructuredRequestTo(fallbackResult.action_items, fallbackResult.scheduling, fallbackResult.execution, environment),
        context: context.length > 0
            ? context
            : inferStructuredRequestContext(fallbackUserMessage, fallbackResult.action_items, fallbackResult.scheduling, environment),
        complete_condition: completeCondition.length > 0
            ? completeCondition
            : inferStructuredRequestCompleteCondition(fallbackResult.intent, fallbackResult.action_items, fallbackResult.scheduling, environment),
    };
    const normalizedEnglish = typeof record.normalized_english === "string"
        ? normalizeStructuredText(record.normalized_english)
        : "";
    return {
        ...request,
        normalized_english: normalizedEnglish || normalized?.normalizedEnglish || buildNormalizedEnglishSummary(request),
    };
}
function withStructuredRequest(userMessage, result, environment, normalized) {
    const artifacts = finalizeStructuredArtifacts({
        userMessage,
        result,
        environment,
        structuredRequest: synthesizeStructuredRequest(userMessage, result, environment, normalized),
        ...(normalized ? { normalized } : {}),
    });
    return {
        ...result,
        notes: artifacts.notes,
        structured_request: artifacts.structuredRequest,
        intent_envelope: artifacts.intentEnvelope,
    };
}
function intakeFailureForAttempt(attempt) {
    switch (attempt.status) {
        case "provider_failed":
            return {
                status: "failure",
                reasonCode: attempt.reasonCode,
                retryable: attempt.reasonCode !== "provider_contract_rejected",
            };
        case "timed_out":
            return { status: "failure", reasonCode: "deadline_exceeded", retryable: true };
        case "cancelled":
            return { status: "failure", reasonCode: "cancelled", retryable: false };
        case "output_limit_exceeded":
        case "response_tool_missing":
        case "response_tool_multiple":
        case "response_tool_name_invalid":
        case "response_tool_input_invalid":
            return { status: "failure", reasonCode: "response_invalid", retryable: true };
    }
}
function repairInputForAttempt(attempt, validationIssues) {
    const value = attempt.status === "parsed"
        ? {
            status: "contract_validation_failed",
            validation_issues: validationIssues,
            output: attempt.value,
        }
        : { status: attempt.status };
    return JSON.stringify(value).slice(0, 32 * 1_024);
}
function isRepairableIntakeAttempt(attempt) {
    return (attempt.status === "parsed"
        || attempt.status === "output_limit_exceeded"
        || attempt.status === "response_tool_missing"
        || attempt.status === "response_tool_multiple"
        || attempt.status === "response_tool_name_invalid"
        || attempt.status === "response_tool_input_invalid");
}
export function isTaskIntakeAnalysisOutcome(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const candidate = value;
    return candidate.status === "success" || candidate.status === "failure";
}
export async function analyzeTaskIntakeOutcome(params) {
    const config = params.config;
    const maxDelegationTurns = config.orchestration.maxDelegationTurns;
    const environment = buildStructuredRequestEnvironment(params.sessionId, params.source);
    const normalized = normalizeRequestForIntake(params.userMessage);
    const intakeMessage = normalized.normalizedEnglish || params.userMessage;
    const model = params.model ?? getDefaultModel(config);
    const providerId = detectAvailableProvider(config);
    const provider = getProvider(providerId, config);
    const context = buildConversationContext(params.sessionId, params.requestGroupId, params.userMessage, normalized.normalizedEnglish, params.source);
    const workDir = params.workDir ?? config.profile.workspace;
    const instructions = loadMergedInstructions(workDir, params.instructionRuntime);
    const profileContext = buildUserProfilePromptContext(config.profile);
    const promptLocale = resolvePromptLocaleForRequest(config.profile.language, params.userMessage);
    const mainAgentSelfName = resolveMainAgentSelfName(config, promptLocale);
    const mainAgentIdentityContext = buildMainAgentIdentityPromptContext(config, promptLocale, workDir);
    log.fieldDebug("starting intake analysis", {
        sessionId: params.sessionId ?? null,
        model,
        providerId,
        workDir,
        contextLength: context.length,
        instructionSources: instructions.chain.sources.map((source) => source.path),
    });
    const baseMessages = [
        {
            role: "user",
            content: loadPromptTemplate({
                sourceId: "task_intake_user",
                workDir,
                variables: { conversationContext: context },
            }),
        },
    ];
    const identity = {
        mainAgentSelfName,
        userName: resolveUserProfileName(config.profile),
    };
    const promptAssembly = buildTaskIntakeFirstResponsePromptAssembly({
        maxDelegationTurns,
        workDir,
        mainAgentName: mainAgentSelfName,
        productName: KNOWBEE_PRODUCT_NAME,
        productNameKo: KNOWBEE_PRODUCT_NAME_KO,
        identityContext: mainAgentIdentityContext,
    });
    let messages = baseMessages;
    let attemptCount = 0;
    for (;;) {
        const repair = attemptCount > 0;
        const providerInvocationRef = `intake:${randomUUID()}`;
        attemptCount += 1;
        const attempt = await collectStructuredToolAttempt({
            stream: (signal) => chatWithContextPreflight({
                provider,
                model,
                messages,
                system: [
                    promptAssembly.systemPrompt,
                    instructions.mergedText
                        ? `\n${agentRuntimePromptContextLabel("instruction_chain_header")}\n${instructions.mergedText}`
                        : "",
                    profileContext ? `\n${profileContext}` : "",
                ].join("\n"),
                tools: [TASK_INTAKE_RESPONSE_TOOL],
                toolChoice: "required",
                signal,
                memoryConfig: config.memory,
                metadata: {
                    invocationId: providerInvocationRef,
                    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
                    ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
                    mainAgentNameSnapshot: mainAgentSelfName,
                    operation: repair ? "task_intake_schema_repair" : "task_intake",
                    llmStage: "intake",
                },
            }),
            ...(params.signal ? { signal: params.signal } : {}),
            deadlineMs: TASK_INTAKE_OPERATION_TIMEOUT_MS,
            responseToolName: TASK_INTAKE_RESPONSE_TOOL_NAME,
            maxTextBytes: 4_096,
            maxToolInputBytes: 128 * 1_024,
        });
        const parseOutcome = attempt.status === "parsed"
            ? parseTaskIntakeResultValue(attempt.value, maxDelegationTurns, params.userMessage, environment, normalized)
            : { result: null, issues: [attempt.status] };
        let parsed = parseOutcome.result;
        let identityClaimInvalid = false;
        if (parsed) {
            const identityValidation = validateIdentityClaim({
                claim: parsed.identity_claim,
                mainAgentName: identity.mainAgentSelfName,
                userName: identity.userName,
            });
            if (!identityValidation.ok) {
                identityClaimInvalid = true;
                parsed = null;
            }
        }
        log.fieldDebug("finished intake analysis attempt", {
            sessionId: params.sessionId ?? null,
            attemptCount,
            resultStatus: attempt.status,
            validationIssues: parseOutcome.issues,
            parsed: parsed == null
                ? null
                : {
                    category: parsed.intent.category,
                    actions: parsed.action_items.map((item) => item.type),
                    scheduling: parsed.scheduling,
                },
        });
        if (parsed) {
            return {
                status: "success",
                intake: parsed,
                directResponseProvenance: {
                    taskIntakePromptSha256: promptAssembly.taskIntakePromptSha256,
                    finalResponsePromptSha256: promptAssembly.finalResponsePromptSha256,
                    providerInvocationRef,
                },
            };
        }
        if (identityClaimInvalid) {
            return { status: "failure", reasonCode: "response_invalid", retryable: true };
        }
        if (!isRepairableIntakeAttempt(attempt)) {
            return intakeFailureForAttempt(attempt);
        }
        if (repair) {
            return { status: "failure", reasonCode: "response_invalid", retryable: true };
        }
        messages = [
            ...baseMessages,
            {
                role: "user",
                content: loadPromptTemplate({
                    sourceId: "task_intake_schema_retry_user",
                    workDir,
                    variables: {
                        previousOutput: repairInputForAttempt(attempt, parseOutcome.issues),
                        validationIssues: JSON.stringify(parseOutcome.issues),
                    },
                }),
            },
        ];
    }
}
export async function analyzeTaskIntake(params) {
    const outcome = await analyzeTaskIntakeOutcome(params);
    return outcome.status === "success" ? outcome.intake : null;
}
function buildConversationContext(sessionId, requestGroupId, latestUserMessage, normalizedEnglishMessage, source) {
    const lines = [];
    const environment = buildStructuredRequestEnvironment(sessionId, source);
    if (sessionId) {
        const recentMessages = requestGroupId
            ? selectRequestGroupContextMessages(getMessagesForRequestGroupWithRunMeta(sessionId, requestGroupId))
            : getMessages(sessionId);
        const recent = recentMessages.slice(-8);
        if (recent.length > 0) {
            lines.push(intakeConversationContextLabel("recent_conversation"));
            for (const message of recent) {
                const role = message.role === "assistant" ? "assistant" : "user";
                const content = message.content.trim();
                if (content) {
                    lines.push(`- ${role}: ${content}`);
                }
            }
            lines.push("");
        }
    }
    const runtimeContext = buildRuntimeIntakeContext();
    if (runtimeContext.length > 0) {
        lines.push(intakeConversationContextLabel("runtime_environment"));
        lines.push(...runtimeContext);
        lines.push("");
    }
    lines.push(intakeConversationContextLabel("delivery_environment"));
    lines.push(...environment.contextLines.map((line) => `- ${line}`));
    lines.push("");
    lines.push(intakeConversationContextLabel("normalized_english_request"));
    lines.push(normalizedEnglishMessage.trim() || latestUserMessage.trim());
    lines.push("");
    lines.push(intakeConversationContextLabel("latest_user_message"));
    lines.push(latestUserMessage.trim());
    return lines.join("\n");
}
function buildRuntimeIntakeContext() {
    const snapshots = getMqttExtensionSnapshots();
    const connected = snapshots.filter((item) => (item.state ?? "").toLowerCase() !== "offline");
    if (connected.length === 0)
        return [];
    const lines = [`- Connected Yeonjang extensions: ${connected.length}`];
    for (const extension of connected.slice(0, 4)) {
        lines.push(`- Extension: ${extension.extensionId}` +
            `${extension.displayName ? ` (${extension.displayName})` : ""}` +
            `${extension.state ? `, state=${extension.state}` : ""}`);
    }
    if (connected.length === 1) {
        const only = connected[0];
        lines.push(`- There is exactly one connected extension (${only?.extensionId ?? "unknown"}). ` +
            "Unless the user explicitly mentions another device or another computer, do not ask which device to use.");
    }
    return lines;
}
function parseTaskIntakeResultValue(value, maxDelegationTurns, latestUserMessage, environment, normalized) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { result: null, issues: ["response_shape_invalid"] };
    }
    try {
        const parsed = value;
        if (!parsed.intent ||
            !parsed.user_message ||
            !Array.isArray(parsed.action_items) ||
            !parsed.scheduling ||
            !parsed.execution) {
            return { result: null, issues: ["response_shape_invalid"] };
        }
        if (typeof parsed.intent.summary !== "string" || typeof parsed.user_message.text !== "string") {
            return { result: null, issues: ["response_shape_invalid"] };
        }
        const primitiveIssues = [];
        if (!isIntentCategory(parsed.intent.category)) {
            primitiveIssues.push("intent_category_invalid");
        }
        if (!isModelMessageMode(parsed.user_message.mode)) {
            primitiveIssues.push("model_message_mode_invalid");
        }
        if (primitiveIssues.length > 0) {
            return { result: null, issues: primitiveIssues };
        }
        const intentCategory = parsed.intent.category;
        const messageMode = parsed.user_message.mode;
        const parsedNotes = Array.isArray(parsed.notes)
            ? parsed.notes.filter((item) => typeof item === "string")
            : [];
        const resultWithoutStructuredArtifacts = {
            intent: {
                category: intentCategory,
                summary: parsed.intent.summary,
                confidence: typeof parsed.intent.confidence === "number" ? parsed.intent.confidence : 0,
            },
            user_message: {
                mode: messageMode,
                text: parsed.user_message.text,
            },
            identity_claim: parseIdentityClaim(parsed.identity_claim),
            action_items: parsed.action_items.filter((item) => typeof item?.id === "string" &&
                isActionType(item.type) &&
                typeof item.title === "string" &&
                isPriority(item.priority) &&
                typeof item.reason === "string" &&
                !!item.payload &&
                typeof item.payload === "object"),
            scheduling: {
                detected: Boolean(parsed.scheduling.detected),
                kind: parsed.scheduling.kind === "one_time" || parsed.scheduling.kind === "recurring"
                    ? parsed.scheduling.kind
                    : "none",
                status: parsed.scheduling.status === "accepted" ||
                    parsed.scheduling.status === "failed" ||
                    parsed.scheduling.status === "needs_clarification"
                    ? parsed.scheduling.status
                    : "not_applicable",
                schedule_text: typeof parsed.scheduling.schedule_text === "string"
                    ? parsed.scheduling.schedule_text
                    : "",
                ...(typeof parsed.scheduling.cron === "string" ? { cron: parsed.scheduling.cron } : {}),
                ...(typeof parsed.scheduling.run_at === "string"
                    ? { run_at: parsed.scheduling.run_at }
                    : {}),
                ...(typeof parsed.scheduling.failure_reason === "string"
                    ? { failure_reason: parsed.scheduling.failure_reason }
                    : {}),
            },
            execution: {
                requires_run: Boolean(parsed.execution.requires_run),
                requires_delegation: Boolean(parsed.execution.requires_delegation),
                suggested_target: typeof parsed.execution.suggested_target === "string"
                    ? parsed.execution.suggested_target
                    : "auto",
                max_delegation_turns: typeof parsed.execution.max_delegation_turns === "number"
                    ? parsed.execution.max_delegation_turns
                    : maxDelegationTurns,
                needs_tools: Boolean(parsed.execution.needs_tools),
                needs_web: Boolean(parsed.execution.needs_web),
                execution_semantics: parseTaskExecutionSemantics(parsed.execution.execution_semantics),
            },
            notes: Array.from(new Set([...parsedNotes, LLM_INTAKE_RESULT_NOTE])),
        };
        const artifacts = finalizeStructuredArtifacts({
            userMessage: latestUserMessage,
            result: resultWithoutStructuredArtifacts,
            environment,
            structuredRequest: parseTaskStructuredRequest(parsed.structured_request, latestUserMessage, resultWithoutStructuredArtifacts, environment, normalized),
            ...(normalized ? { normalized } : {}),
        });
        const result = promotePromissoryDirectAnswer({
            ...resultWithoutStructuredArtifacts,
            notes: artifacts.notes,
            structured_request: artifacts.structuredRequest,
            intent_envelope: artifacts.intentEnvelope,
        }, latestUserMessage);
        const correctedResult = result;
        const consistency = validateIntakeDecisionConsistency({
            intent: correctedResult.intent,
            userMessage: correctedResult.user_message,
            actionItems: correctedResult.action_items,
            execution: correctedResult.execution,
        });
        const conversationDecision = validateConversationDecision(conversationDecisionForIntake(correctedResult));
        const methodConstraints = extractIntakeMethodConstraints(correctedResult.action_items);
        const issues = [
            ...consistency.issues,
            ...conversationDecision.issues.map((issue) => `conversation_${issue}`),
            ...(methodConstraints.ok ? [] : [methodConstraints.reasonCode]),
        ];
        return {
            result: issues.length === 0 ? correctedResult : null,
            issues,
        };
    }
    catch {
        return { result: null, issues: ["response_shape_invalid"] };
    }
}
function parseIdentityClaim(value) {
    if (!value || typeof value !== "object")
        return { subject: "none", claimed_name: "" };
    const candidate = value;
    const subject = candidate.subject === "main_agent" || candidate.subject === "user" ? candidate.subject : "none";
    return {
        subject,
        claimed_name: subject === "none" || typeof candidate.claimed_name !== "string"
            ? ""
            : candidate.claimed_name,
    };
}
function isIntentCategory(value) {
    return isTaskIntakeIntentCategory(value);
}
function isModelMessageMode(value) {
    return (value === "direct_answer" ||
        value === "accepted_receipt" ||
        value === "clarification_receipt");
}
function isActionType(value) {
    return (value === "reply" ||
        value === "run_task" ||
        value === "delegate_agent" ||
        value === "create_schedule" ||
        value === "update_schedule" ||
        value === "cancel_schedule" ||
        value === "ask_user" ||
        value === "log_only");
}
function isPriority(value) {
    return value === "low" || value === "normal" || value === "high" || value === "urgent";
}
function isApprovalToolName(value) {
    return (value === "screen_capture" ||
        value === "yeonjang_camera_capture" ||
        value === "mouse_click" ||
        value === "keyboard_type" ||
        value === "file_write" ||
        value === "app_launch" ||
        value === "external_action");
}
function isStructuredRequestLanguage(value) {
    return value === "ko" || value === "en" || value === "unknown";
}
import { randomUUID } from "node:crypto";
//# sourceMappingURL=intake.js.map