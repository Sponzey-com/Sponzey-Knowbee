import { homedir } from "node:os";
import { dirname } from "node:path";
import { detectAvailableProvider, getDefaultModel, getProvider, shouldForceReasoningMode, } from "../ai/index.js";
import { isAIProviderInvocationError, } from "../ai/provider-failure.js";
import { admitCanonicalExecutionNextAction } from "../contracts/canonical-next-action.js";
import { admitInitialWebResearchMethod, readUserWebUrlCandidates, } from "../contracts/web-initial-method-admission.js";
import { getDb, getMessages, getMessagesForRequestGroup, getMessagesForRequestGroupWithRunMeta, getMessagesForRun, getPromptSourceStates, getSession, insertAuditLog, insertDiagnosticEvent, insertMessage, insertSession, updateRunPromptSourceSnapshot, upsertPromptSources, } from "../db/index.js";
import { eventBus } from "../events/index.js";
import { createInstructionRuntimeContext, loadMergedInstructions } from "../instructions/merge.js";
import { createLogger, redactLogText } from "../logger/index.js";
import { buildFlashFeedbackContext } from "../memory/flash-feedback.js";
import { loadKnowbeeMd, loadPromptSourceRegistry, loadPromptTemplate, loadSystemPromptSourceAssembly, } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { buildMemoryContext } from "../memory/store.js";
import { recordLatencyMetric } from "../observability/latency.js";
import { chatWithContextPreflight } from "../runs/context-preflight.js";
import { sanitizeUserFacingError } from "../runs/error-sanitizer.js";
import { shouldTerminateRunAfterSuccessfulTool } from "../runs/isolated-tool-response.js";
import { buildYeonjangFailureEvidenceRecoveryPayload } from "../runs/recovery.js";
import { appendRunEvent } from "../runs/store.js";
import { dispatchRunScopedTool, isRunScopedPreDispatchFailureDetails, projectRunScopedInstruction, projectRunScopedToolNames, } from "../runs/run-scoped-tool-admission.js";
import { projectValidatedWebToolResultForAgent } from "../runs/web-evidence-agent-bridge.js";
import { createWebResearchRunRecorder, projectWebResearchRecordedEvidence, } from "../runs/web-research-run-recorder.js";
import { buildScheduleMemoryContext } from "../schedules/context.js";
import { createContextBlock, createUntrustedEvidenceEnvelope, renderContextBlockForPrompt, renderUntrustedEvidenceForPrompt, } from "../security/trust-boundary.js";
import { toolDispatcher } from "../tools/runtime-dispatcher.js";
import { buildMainAgentIdentityPromptContext, buildMainAgentPromptVariables, resolveMainAgentSelfName, resolvePromptLocaleForRequest, } from "./main-agent-identity.js";
import { buildUserProfilePromptContext } from "./profile-context.js";
import { selectRequestGroupContextMessages } from "./request-group-context.js";
import { buildAgentTerminalFailureNotice, } from "./terminal-failure-notice.js";
import { buildWebAccessRuntimePrompt } from "./web-access-runtime-prompt.js";
const log = createLogger("agent");
const MAIN_AGENT_MEMORY_OWNER_SCOPE = { ownerType: "knowbee", ownerId: "agent:knowbee" };
const AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID = "agent_runtime_prompt_context_labels_user";
const MAX_TOOL_ROUNDS = 20; // prevent infinite loops
const MAX_CONTEXT_TOKENS = 150_000;
const EXECUTION_RECOVERY_TOOL_NAMES = new Set([
    "shell_exec",
    "app_launch",
    "process_kill",
    "screen_capture",
    "mouse_move",
    "mouse_click",
    "keyboard_type",
    "yeonjang_camera_list",
    "yeonjang_camera_capture",
]);
function canonicalUrlKey(value) {
    try {
        return new URL(value).toString();
    }
    catch {
        return null;
    }
}
function remainingObservedFetchUrls(input) {
    const remaining = [];
    const seen = new Set();
    const candidates = [
        ...input.observedSearchResults.values(),
        ...input.observedFetchCandidates.values(),
        ...input.userFetchUrls.map((sourceUrl) => ({ sourceUrl })),
    ];
    for (const candidate of candidates) {
        const key = canonicalUrlKey(candidate.sourceUrl);
        if (!key || seen.has(key) || input.attemptedFetchUrls.has(key))
            continue;
        seen.add(key);
        remaining.push(candidate.sourceUrl);
    }
    return remaining;
}
function constrainWebFetchTool(tool, candidateUrls) {
    const currentUrlSchema = tool.input_schema.properties["url"];
    const urlSchema = currentUrlSchema &&
        typeof currentUrlSchema === "object" &&
        !Array.isArray(currentUrlSchema)
        ? currentUrlSchema
        : { type: "string" };
    return {
        ...tool,
        input_schema: {
            ...tool.input_schema,
            properties: {
                ...tool.input_schema.properties,
                url: {
                    ...urlSchema,
                    enum: [...candidateUrls],
                },
            },
        },
    };
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
function agentRuntimeErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
function renderPromptContext(params) {
    const content = params.content.trim();
    if (!content)
        return "";
    return `\n${renderContextBlockForPrompt(createContextBlock({
        id: params.id,
        tag: params.tag,
        title: params.title,
        content,
    }))}`;
}
function resolveRunAgentMemoryOwnerScope(params) {
    const agentId = params.agentId?.trim();
    if (agentId && params.agentType === "sub_agent") {
        return { ownerType: "sub_agent", ownerId: agentId };
    }
    if (agentId && params.agentType === "knowbee") {
        return { ownerType: "knowbee", ownerId: agentId };
    }
    return MAIN_AGENT_MEMORY_OWNER_SCOPE;
}
const TRUSTED_SCREEN_PERMISSION_DENIED_OUTPUT = "Yeonjang 화면 캡처는 운영 체제의 화면 캡처 권한이 거부되어 시작되지 않았습니다. 시스템 설정에서 Yeonjang의 화면 캡처 권한을 허용한 뒤 다시 요청해 주세요.";
export async function* runAgent(params) {
    const runId = params.runId ?? crypto.randomUUID();
    const sessionId = params.sessionId ?? crypto.randomUUID();
    const config = params.config;
    const model = params.model ?? getDefaultModel(config);
    const workDir = params.workDir ?? homedir();
    const signal = params.signal ?? new AbortController().signal;
    const toolsEnabled = params.toolsEnabled ?? true;
    const contextMode = params.contextMode ?? "full";
    const now = Date.now();
    // Upsert session
    const existing = getSession(sessionId);
    if (!existing) {
        insertSession({
            id: sessionId,
            source: params.source ?? "cli",
            source_id: null,
            created_at: now,
            updated_at: now,
            summary: null,
        });
    }
    else {
        getDb().prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);
    }
    eventBus.emit("agent.start", { sessionId, runId });
    log.info(`Agent run ${runId} started (session=${sessionId}, model=${model})`);
    // Load prior messages from DB
    const priorDbMessages = contextMode === "isolated"
        ? []
        : contextMode === "handoff"
            ? getMessagesForRun(sessionId, runId)
            : contextMode === "request_group"
                ? params.requestGroupId
                    ? selectRequestGroupContextMessages(getMessagesForRequestGroupWithRunMeta(sessionId, params.requestGroupId))
                    : []
                : params.requestGroupId
                    ? getMessagesForRequestGroup(sessionId, params.requestGroupId)
                    : getMessages(sessionId);
    const rawMessages = priorDbMessages.map((m) => ({
        role: m.role,
        content: m.tool_calls ? JSON.parse(m.tool_calls) : m.content,
    }));
    // Sanitize: strip orphaned tool_call blocks
    const messages = [];
    for (let i = 0; i < rawMessages.length; i++) {
        const msg = rawMessages[i];
        if (msg.role === "assistant" &&
            Array.isArray(msg.content) &&
            msg.content.some((b) => b.type === "tool_use")) {
            const next = rawMessages[i + 1];
            const nextHasToolResults = next != null &&
                Array.isArray(next.content) &&
                next.content.some((b) => b.type === "tool_result");
            if (!nextHasToolResults) {
                const textOnly = msg.content
                    .filter((b) => b.type === "text")
                    .map((b) => b.text ?? "")
                    .join("\n");
                if (textOnly)
                    messages.push({ role: "assistant", content: textOnly });
                log.warn(`Stripped orphaned tool_calls from assistant message (session=${sessionId})`);
                continue;
            }
        }
        messages.push(msg);
    }
    // Append the new user message
    const userMsg = { role: "user", content: params.userMessage };
    messages.push(userMsg);
    insertMessage({
        id: crypto.randomUUID(),
        session_id: sessionId,
        root_run_id: runId,
        role: "user",
        content: params.userMessage,
        tool_calls: null,
        tool_call_id: null,
        created_at: Date.now(),
    });
    // Build tool definitions
    const requiredToolNames = new Set(params.requiredToolNames ?? []);
    const executionOwnerAgentId = params.agentId?.trim() ||
        params.admittedCapabilityExecutionScope?.ownerAgentId ||
        "agent:knowbee";
    const allowWebAccess = params.admittedCapabilityExecutionScope?.toolNames.includes("web_search") === true ||
        params.admittedCapabilityExecutionScope?.toolNames.includes("web_fetch") === true;
    const sourceAvailableTools = toolsEnabled
        ? toolDispatcher
            .getAll()
            .filter((tool) => toolDispatcher.isToolAvailableForSource(tool, params.source ?? "cli") &&
            (allowWebAccess ||
                (tool.name !== "web_search" && tool.name !== "web_fetch")))
        : [];
    const admittedToolNames = params.admittedCapabilityExecutionScope
        ? new Set(projectRunScopedToolNames({
            scope: params.admittedCapabilityExecutionScope,
            runId,
            ownerAgentId: executionOwnerAgentId,
            availableToolNames: sourceAvailableTools.map((tool) => tool.name),
        }))
        : undefined;
    const tools = admittedToolNames
        ? sourceAvailableTools.filter((tool) => admittedToolNames.has(tool.name))
        : sourceAvailableTools;
    const canonicalWebEvidenceEnabled = allowWebAccess;
    const modelVisibleTools = canonicalWebEvidenceEnabled
        ? tools.filter((tool) => tool.name === "web_search" || tool.name === "web_fetch")
        : tools;
    const toolDefs = modelVisibleTools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
    }));
    const modelVisibleToolNames = new Set(modelVisibleTools.map((tool) => tool.name));
    const effectiveRequiredToolNames = new Set([...requiredToolNames].filter((toolName) => modelVisibleToolNames.has(toolName)));
    const selectedInstructionSkill = params.admittedCapabilityExecutionScope
        ? projectRunScopedInstruction({
            scope: params.admittedCapabilityExecutionScope,
            runId,
            ownerAgentId: executionOwnerAgentId,
        })
        : null;
    const resolvedProviderId = params.providerId ?? detectAvailableProvider(config);
    const provider = params.provider ?? getProvider(resolvedProviderId, config);
    const forceReasoningMode = shouldForceReasoningMode(resolvedProviderId, model, config);
    // ── Build system prompt with KNOWBEE.md + memory context ────────────────
    const promptStartedAt = Date.now();
    const promptLocale = resolvePromptLocaleForRequest(config.profile.language, params.userMessage);
    const mainAgentSelfName = resolveMainAgentSelfName(config, promptLocale);
    const promptVariables = buildMainAgentPromptVariables(config, promptLocale);
    const promptSourceRegistry = loadPromptSourceRegistry(workDir);
    upsertPromptSources(promptSourceRegistry.map(({ content: _content, ...metadata }) => metadata));
    const promptAssembly = loadSystemPromptSourceAssembly(workDir, promptLocale, getPromptSourceStates(), promptVariables, "execution");
    if (promptAssembly)
        updateRunPromptSourceSnapshot(runId, promptAssembly.snapshot);
    const baseSystemPrompt = promptAssembly?.text ??
        loadPromptTemplate({
            sourceId: "system",
            workDir,
            locale: promptLocale,
            variables: promptVariables,
        });
    const runtimeDirective = [
        agentRuntimePromptContextLabel("runtime_header"),
        agentRuntimePromptContextLabel("today_line", { today: new Date().toLocaleDateString() }),
    ].join("\n");
    const reasoningDirective = forceReasoningMode
        ? `\n${loadPromptTemplate({ sourceId: "reasoning_policy_runtime", workDir })}`
        : "";
    const webPolicyDirective = `\n${buildWebAccessRuntimePrompt(workDir)}`;
    const instructions = loadMergedInstructions(workDir, createInstructionRuntimeContext(dirname(params.memoryJournal.memoryDbFile)));
    const profileContext = buildUserProfilePromptContext(config.profile);
    const knowbeeMd = loadKnowbeeMd(workDir);
    if (knowbeeMd) {
        appendRunEvent(runId, "prompt_legacy_project_memory_loaded");
        insertDiagnosticEvent({
            kind: "legacy_prompt_source_used",
            summary: "Legacy project memory was appended after prompt source registry assembly.",
            runId,
            sessionId,
            ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
            detail: {
                priority: "prompts/ registry first, legacy KNOWBEE.md/WIZBY.md/HOWIE.md appended as project memory context",
                workDir,
            },
        });
    }
    appendAgentLatencyEvent(runId, "prompt_ms", Date.now() - promptStartedAt);
    const memoryStartedAt = Date.now();
    const flashFeedbackContext = buildFlashFeedbackContext({
        sessionId,
        limit: 4,
        maxChars: contextMode === "isolated" ? 500 : 800,
    });
    const scheduleMemoryContext = params.includeScheduleMemory && params.scheduleId
        ? buildScheduleMemoryContext({ scheduleId: params.scheduleId, maxRuns: 3 })
        : "";
    const memoryOwnerScope = resolveRunAgentMemoryOwnerScope(params);
    const memoryContext = await buildMemoryContext({
        journalRepository: params.memoryJournal,
        query: params.memorySearchQuery ?? params.userMessage,
        sessionId,
        runId,
        ownerScope: memoryOwnerScope,
        recipientScope: memoryOwnerScope,
        ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
        ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
        ...(params.includeScheduleMemory ? { includeSchedule: true } : {}),
        searchMode: config.memory.searchMode ?? "fts",
        memoryConfig: config.memory,
        budget: {
            maxChunks: contextMode === "handoff" ? 3 : 4,
            maxChars: contextMode === "isolated" ? 1400 : 2200,
            maxChunkChars: 420,
        },
    });
    appendAgentLatencyEvent(runId, "memory_total_ms", Date.now() - memoryStartedAt);
    const externalDataContext = [
        knowbeeMd
            ? renderPromptContext({
                id: "project-memory",
                tag: "file_content",
                title: "Project Memory",
                content: knowbeeMd,
            })
            : "",
        flashFeedbackContext
            ? renderPromptContext({
                id: "flash-feedback-context",
                tag: "user_input",
                title: "Flash Feedback Context",
                content: flashFeedbackContext,
            })
            : "",
        scheduleMemoryContext
            ? renderPromptContext({
                id: "schedule-memory-context",
                tag: "user_input",
                title: "Schedule Memory Context",
                content: scheduleMemoryContext,
            })
            : "",
        memoryContext
            ? renderPromptContext({
                id: "memory-context",
                tag: "tool_result",
                title: "Memory Context",
                content: memoryContext,
            })
            : "",
    ]
        .filter(Boolean)
        .join("\n");
    if (externalDataContext) {
        messages.splice(Math.max(0, messages.length - 1), 0, {
            role: "user",
            content: externalDataContext,
        });
    }
    const systemPrompt = [
        buildMainAgentIdentityPromptContext(config, promptLocale, workDir),
        "\n",
        baseSystemPrompt,
        `\n${runtimeDirective}`,
        reasoningDirective,
        webPolicyDirective,
        instructions.mergedText
            ? `\n${agentRuntimePromptContextLabel("instruction_chain_header")}\n${instructions.mergedText}`
            : "",
        selectedInstructionSkill
            ? `\n${agentRuntimePromptContextLabel("selected_instruction_skill_header")}\n${selectedInstructionSkill.content}`
            : "",
        profileContext ? `\n${profileContext}` : "",
    ].join("");
    let totalTokens = 0;
    let textBuffer = "";
    let firstChunkRecorded = false;
    const ctx = {
        artifactStorage: params.artifactStorage,
        sessionId,
        runId,
        ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
        workDir,
        userMessage: params.userMessage,
        source: params.source ?? "cli",
        ...(params.agentId ? { agentId: params.agentId } : {}),
        ...(params.agentType ? { agentType: params.agentType } : {}),
        allowWebAccess,
        signal,
        mqttConfig: config.mqtt,
        securityConfig: config.security,
        searchConfig: config.search,
        memoryConfig: config.memory,
        onProgress: (msg) => {
            if (msg.trim())
                log.debug(`[tool progress] ${msg.trim()}`);
        },
    };
    const webResearchRunRecorder = canonicalWebEvidenceEnabled
        ? createWebResearchRunRecorder({ runId })
        : null;
    const requiredChangedWebFetch = effectiveRequiredToolNames.has("web_fetch");
    let canonicalWebEvidenceCompleted = params.webExecutionState?.validatedEvidence.status === "available"
        && !requiredChangedWebFetch;
    let canonicalWebSearchAttempted = params.webExecutionState?.discovery.status === "attempted";
    const attemptedWebMethodFingerprints = new Set();
    const observedWebFetchCandidates = new Map((params.webExecutionState?.observedFetchCandidates ?? []).map((candidate) => [candidate.sourceUrl, candidate]));
    const observedSearchResults = new Map((params.webExecutionState?.observedSearchResults ?? []).map((candidate) => [candidate.sourceUrl, candidate]));
    const userFetchUrls = readUserWebUrlCandidates(params.memorySearchQuery ?? params.userMessage);
    const attemptedFetchUrls = new Set((params.webExecutionState?.attemptedFetchUrls ?? [])
        .map(canonicalUrlKey)
        .filter((url) => url !== null));
    let lastCanonicalWebFailureReason = null;
    // Tool-call loop
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (signal.aborted) {
            yield { type: "error", message: "Aborted by user" };
            return;
        }
        const pendingToolUses = [];
        const mustUseRequiredTool = round === 0 && effectiveRequiredToolNames.size > 0;
        const admittedRoundToolDefs = mustUseRequiredTool
            ? toolDefs.filter((tool) => effectiveRequiredToolNames.has(tool.name))
            : toolDefs;
        const candidateFetchUrls = canonicalWebSearchAttempted
            ? remainingObservedFetchUrls({
                observedSearchResults,
                observedFetchCandidates: observedWebFetchCandidates,
                userFetchUrls,
                attemptedFetchUrls,
            })
            : [];
        const roundToolDefs = canonicalWebEvidenceCompleted && !mustUseRequiredTool
            ? []
            : admittedRoundToolDefs.flatMap((tool) => {
                if (tool.name === "web_search" && canonicalWebSearchAttempted)
                    return [];
                if (tool.name !== "web_fetch" || !canonicalWebSearchAttempted)
                    return [tool];
                return candidateFetchUrls.length > 0
                    ? [constrainWebFetchTool(tool, candidateFetchUrls)]
                    : [];
            });
        if (canonicalWebEvidenceEnabled && canonicalWebSearchAttempted) {
            appendRunEvent(runId, [
                `canonical_web_round=${round + 1}`,
                `search_candidates=${observedSearchResults.size}`,
                `fetch_candidates=${observedWebFetchCandidates.size}`,
                `evidence_completed=${canonicalWebEvidenceCompleted ? "yes" : "no"}`,
                `fetch_admitted=${roundToolDefs.some((tool) => tool.name === "web_fetch") ? "yes" : "no"}`,
                `signal_aborted=${signal.aborted ? "yes" : "no"}`,
            ].join(";"));
        }
        const toolChoiceRequired = mustUseRequiredTool;
        try {
            for await (const chunk of chatWithContextPreflight({
                provider,
                model,
                messages,
                system: systemPrompt,
                tools: roundToolDefs,
                ...(toolChoiceRequired && roundToolDefs.length > 0
                    ? { toolChoice: "required" }
                    : {}),
                signal,
                memoryConfig: config.memory,
                metadata: {
                    runId,
                    sessionId,
                    mainAgentNameSnapshot: mainAgentSelfName,
                    ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
                    operation: "agent_round",
                    llmStage: "execution",
                },
            })) {
                if (signal.aborted)
                    break;
                if (!firstChunkRecorded) {
                    firstChunkRecorded = true;
                    appendAgentLatencyEvent(runId, "first_chunk_ms", Date.now() - now);
                }
                if (chunk.type === "text_delta") {
                    textBuffer += chunk.delta;
                }
                else if (chunk.type === "tool_use") {
                    pendingToolUses.push({ id: chunk.id, name: chunk.name, input: chunk.input });
                }
                else if (chunk.type === "message_stop") {
                    totalTokens += chunk.usage.input_tokens + chunk.usage.output_tokens;
                }
            }
        }
        catch (err) {
            if (signal.aborted) {
                yield { type: "error", message: "Aborted" };
                return;
            }
            const msg = err instanceof Error ? err.message : String(err);
            const sanitized = sanitizeUserFacingError(msg);
            log.error(`AI error: ${agentRuntimeErrorMessage(err)}`);
            textBuffer = "";
            appendRunEvent(runId, "internal_recovery_ai_payload_source:runtime_deterministic");
            appendRunEvent(runId, "internal_recovery_ai_payload_delivery:control_flow_only");
            yield {
                type: "ai_recovery",
                summary: "AI 응답 생성 중 오류가 발생해 다른 방법을 다시 시도합니다.",
                reason: sanitized.reason,
                message: sanitized.userMessage,
                ...(isAIProviderInvocationError(err)
                    ? { providerFailureReasonCode: err.reasonCode }
                    : {}),
            };
            return;
        }
        // No tool calls → final response
        if (pendingToolUses.length === 0) {
            if (textBuffer) {
                const deliveredText = textBuffer;
                yield { type: "text", delta: deliveredText, textSource: "llm_generated" };
                textBuffer = "";
            }
            break;
        }
        // Build assistant message with tool_use blocks
        const assistantContent = [
            ...(textBuffer ? [{ type: "text", text: textBuffer }] : []),
            ...pendingToolUses.map((tu) => ({
                type: "tool_use",
                id: tu.id,
                name: tu.name,
                input: tu.input,
            })),
        ];
        messages.push({ role: "assistant", content: assistantContent });
        insertMessage({
            id: crypto.randomUUID(),
            session_id: sessionId,
            root_run_id: runId,
            role: "assistant",
            content: textBuffer,
            tool_calls: JSON.stringify(assistantContent),
            tool_call_id: null,
            created_at: Date.now(),
        });
        textBuffer = "";
        const nextActionAdmission = admitCanonicalExecutionNextAction(pendingToolUses);
        if (!nextActionAdmission.ok) {
            const repairResults = pendingToolUses.map((toolUse) => ({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                    status: "repair_required",
                    reasonCode: nextActionAdmission.reasonCode,
                }),
                is_error: true,
            }));
            messages.push({ role: "user", content: repairResults });
            insertMessage({
                id: crypto.randomUUID(),
                session_id: sessionId,
                root_run_id: runId,
                role: "user",
                content: "",
                tool_calls: JSON.stringify(repairResults),
                tool_call_id: null,
                created_at: Date.now(),
            });
            appendRunEvent(runId, `canonical_next_action_repair:${nextActionAdmission.reasonCode}`);
            continue;
        }
        if (nextActionAdmission.action.kind !== "execute_tool") {
            appendRunEvent(runId, "canonical_next_action_repair:unexpected_response_only");
            continue;
        }
        // Execute the one admitted canonical tool action.
        const toolResultContents = [];
        const persistedToolResultContents = [];
        const executionRecoveryFailures = [];
        const executedToolResults = [];
        const tu = {
            id: nextActionAdmission.action.toolUseId,
            name: nextActionAdmission.action.toolName,
            input: nextActionAdmission.action.input,
        };
        {
            const canonicalWebTool = canonicalWebEvidenceEnabled &&
                (tu.name === "web_search" || tu.name === "web_fetch");
            const duplicateCanonicalWebAction = Boolean(canonicalWebTool &&
                (canonicalWebEvidenceCompleted &&
                    !(mustUseRequiredTool && tu.name === "web_fetch") &&
                    (tu.name === "web_search" || tu.name === "web_fetch") ||
                    canonicalWebSearchAttempted && tu.name === "web_search"));
            const webMethodAdmission = canonicalWebTool &&
                !duplicateCanonicalWebAction &&
                (tu.name === "web_search" || tu.name === "web_fetch") &&
                params.admittedCapabilityExecutionScope
                ? admitInitialWebResearchMethod({
                    runId,
                    ownerAgentId: executionOwnerAgentId,
                    scope: params.admittedCapabilityExecutionScope,
                    userRequest: params.memorySearchQuery ?? params.userMessage,
                    observedFetchCandidates: [...observedWebFetchCandidates.values()],
                    observedSearchResults: [...observedSearchResults.values()],
                    toolName: tu.name,
                    params: tu.input,
                })
                : null;
            const repeatedWebMethod = webMethodAdmission?.ok === true &&
                attemptedWebMethodFingerprints.has(webMethodAdmission.receipt.proposalFingerprint);
            if (webMethodAdmission?.ok === true &&
                webMethodAdmission.action.kind === "execute_fetch" &&
                !duplicateCanonicalWebAction &&
                !repeatedWebMethod) {
                attemptedFetchUrls.add(webMethodAdmission.action.sourceUrl);
                if (params.webExecutionState) {
                    params.webExecutionState.attemptedFetchUrls = [...attemptedFetchUrls];
                }
            }
            const toolRequestAdmitted = modelVisibleToolNames.has(tu.name) &&
                (!admittedToolNames || admittedToolNames.has(tu.name));
            const rootWebMethod = webMethodAdmission?.ok && !repeatedWebMethod && webResearchRunRecorder
                ? {
                    actionReceiptId: webMethodAdmission.receipt.receiptId,
                    method: webMethodAdmission.action.kind === "execute_search"
                        ? "fast_text_search"
                        : "direct_fetch",
                    strategyFingerprint: webMethodAdmission.receipt.proposalFingerprint,
                }
                : null;
            const rootWebTraceAdmission = rootWebMethod && webResearchRunRecorder
                ? webResearchRunRecorder.startAction(rootWebMethod)
                : null;
            if (toolRequestAdmitted) {
                yield {
                    type: "tool_start",
                    toolName: tu.name,
                    params: canonicalWebTool &&
                        (tu.name === "web_search" || tu.name === "web_fetch")
                        ? { method: tu.name === "web_search" ? "search" : "fetch" }
                        : tu.input,
                };
                if (!duplicateCanonicalWebAction &&
                    !repeatedWebMethod &&
                    (!webMethodAdmission || webMethodAdmission.ok)) {
                    log.info(`Executing tool: ${tu.name}`);
                }
            }
            if (toolRequestAdmitted &&
                webMethodAdmission?.ok === true &&
                !duplicateCanonicalWebAction &&
                tu.name === "web_search") {
                canonicalWebSearchAttempted = true;
                if (params.webExecutionState) {
                    params.webExecutionState.discovery = { status: "attempted" };
                }
            }
            const toolTransportStartedAt = Date.now();
            const toolWasDispatched = toolRequestAdmitted
                && !(rootWebTraceAdmission && !rootWebTraceAdmission.ok)
                && !duplicateCanonicalWebAction
                && !repeatedWebMethod
                && !(webMethodAdmission && !webMethodAdmission.ok);
            const dispatchedResult = !toolRequestAdmitted
                ? {
                    success: false,
                    output: "",
                    error: "tool_not_admitted",
                    details: {
                        kind: "tool_admission_failure",
                        reasonCode: "tool_not_admitted",
                    },
                }
                : rootWebTraceAdmission && !rootWebTraceAdmission.ok
                    ? {
                        success: false,
                        output: "",
                        error: rootWebTraceAdmission.reasonCode,
                        details: {
                            kind: "web_research_run_trace_failure",
                            reasonCode: rootWebTraceAdmission.reasonCode,
                        },
                    }
                    : duplicateCanonicalWebAction
                        ? {
                            success: false,
                            output: "",
                            error: canonicalWebEvidenceCompleted
                                ? "web_evidence_already_completed"
                                : "web_evidence_search_already_executed",
                            details: {
                                kind: "web_evidence_pipeline_failure",
                                reasonCode: canonicalWebEvidenceCompleted
                                    ? "web_evidence_already_completed"
                                    : "web_evidence_search_already_executed",
                            },
                        }
                        : repeatedWebMethod
                            ? {
                                success: false,
                                output: "",
                                error: "web_research_strategy_unchanged",
                                details: {
                                    kind: "web_initial_method_admission_failure",
                                    reasonCode: "web_research_strategy_unchanged",
                                },
                            }
                            : webMethodAdmission && !webMethodAdmission.ok
                                ? {
                                    success: false,
                                    output: "",
                                    error: webMethodAdmission.reasonCode,
                                    details: {
                                        kind: "web_initial_method_admission_failure",
                                        reasonCode: webMethodAdmission.reasonCode,
                                    },
                                }
                                : params.admittedCapabilityExecutionScope
                                    ? await dispatchRunScopedTool({
                                        scope: params.admittedCapabilityExecutionScope,
                                        runId,
                                        ownerAgentId: executionOwnerAgentId,
                                        toolName: tu.name,
                                        params: webMethodAdmission?.ok
                                            ? webMethodAdmission.action.kind === "execute_search"
                                                ? {
                                                    query: webMethodAdmission.action.query,
                                                    freshnessPolicy: webMethodAdmission.action.freshnessPolicy,
                                                }
                                                : {
                                                    url: webMethodAdmission.action.sourceUrl,
                                                    freshnessPolicy: webMethodAdmission.action.freshnessPolicy,
                                                }
                                            : tu.input,
                                        context: ctx,
                                        dispatcher: toolDispatcher,
                                    })
                                    : await toolDispatcher.dispatch(tu.name, tu.input, ctx);
            if (toolWasDispatched) {
                recordLatencyMetric({
                    name: "execution_latency_ms",
                    durationMs: Date.now() - toolTransportStartedAt,
                    runId,
                    requestGroupId: params.requestGroupId ?? runId,
                    source: "canonical_response",
                    detail: {
                        stageCode: "tool_transport",
                        reasonCode: "tool_dispatch",
                    },
                });
            }
            if (rootWebMethod && rootWebTraceAdmission?.ok && webResearchRunRecorder) {
                const parentEvidenceRefs = webMethodAdmission?.ok &&
                    webMethodAdmission.action.kind === "execute_fetch" &&
                    webMethodAdmission.action.parentEvidenceRef
                    ? [webMethodAdmission.action.parentEvidenceRef]
                    : [];
                const evidence = projectWebResearchRecordedEvidence({
                    toolName: tu.name,
                    result: dispatchedResult,
                    parentEvidenceRefs,
                });
                const rootFailureReason = dispatchedResult.error ??
                    (evidence.length === 0 ? "web_evidence_projection_missing" : undefined);
                webResearchRunRecorder.finishAction({
                    ...rootWebMethod,
                    outcome: dispatchedResult.success && evidence.length > 0
                        ? "succeeded"
                        : signal.aborted ? "cancelled" : "failed",
                    ...(rootFailureReason ? { reasonCode: rootFailureReason } : {}),
                    evidence,
                });
            }
            if (webMethodAdmission?.ok && !repeatedWebMethod) {
                attemptedWebMethodFingerprints.add(webMethodAdmission.receipt.proposalFingerprint);
            }
            const result = canonicalWebTool && !duplicateCanonicalWebAction
                ? projectValidatedWebToolResultForAgent(tu.name, dispatchedResult)
                : dispatchedResult;
            if (canonicalWebTool &&
                (tu.name === "web_search" || tu.name === "web_fetch")) {
                for (const candidate of readInternalObservedFetchCandidates(result.details)) {
                    if (observedWebFetchCandidates.size >= 16)
                        break;
                    observedWebFetchCandidates.set(candidate.sourceUrl, candidate);
                }
                if (params.webExecutionState) {
                    params.webExecutionState.observedFetchCandidates = [
                        ...observedWebFetchCandidates.values(),
                    ];
                }
                if (!duplicateCanonicalWebAction) {
                    for (const candidate of readValidatedSearchResults(result.details)) {
                        if (observedSearchResults.size >= 16)
                            break;
                        observedSearchResults.set(candidate.sourceUrl, candidate);
                    }
                    if (params.webExecutionState) {
                        params.webExecutionState.observedSearchResults = [
                            ...observedSearchResults.values(),
                        ];
                    }
                    if (tu.name === "web_search") {
                        appendRunEvent(runId, [
                            `canonical_web_search_candidates=${observedSearchResults.size}`,
                            `signal_aborted=${signal.aborted ? "yes" : "no"}`,
                        ].join(";"));
                    }
                    canonicalWebEvidenceCompleted =
                        (tu.name === "web_fetch" && result.success) || signal.aborted;
                    if (params.webExecutionState &&
                        tu.name === "web_fetch" &&
                        result.success) {
                        params.webExecutionState.validatedEvidence = { status: "available" };
                    }
                    lastCanonicalWebFailureReason = result.success
                        ? null
                        : result.error?.trim() || "web_evidence_verification_incomplete";
                }
            }
            yield {
                type: "tool_end",
                toolName: tu.name,
                success: result.success,
                output: result.output,
                ...buildPublicToolEndProjection(tu.name, result),
            };
            executedToolResults.push({ toolName: tu.name, result });
            if (shouldSignalExecutionRecovery(tu.name, result)) {
                const preDispatchFailure = isRunScopedPreDispatchFailureDetails(result.details)
                    ? result.details
                    : null;
                const yeonjangRecovery = preDispatchFailure
                    ? null
                    : buildYeonjangFailureEvidenceRecoveryPayload({
                        toolName: tu.name,
                        output: result.output,
                        details: result.details,
                        ...(result.evidenceSource ? { evidenceSource: result.evidenceSource } : {}),
                    });
                executionRecoveryFailures.push(preDispatchFailure
                    ? {
                        toolName: tu.name,
                        output: "",
                        summary: "실행 범위 계약을 다시 계획해야 합니다.",
                        reason: "External effect did not start because execution scope validation failed.",
                        reasonCode: preDispatchFailure.reasonCode,
                        evidenceRefs: [
                            `run-scoped-pre-dispatch:${preDispatchFailure.failureFingerprint}`,
                        ],
                    }
                    : yeonjangRecovery
                        ? {
                            toolName: tu.name,
                            output: "",
                            summary: yeonjangRecovery.summary,
                            reason: yeonjangRecovery.reason,
                        }
                        : {
                            toolName: tu.name,
                            output: result.output,
                            ...(result.error ? { error: result.error } : {}),
                        });
            }
            toolResultContents.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: buildToolResultContent(tu.name, result, {
                    sourceRef: `tool:${tu.name}:${tu.id}`,
                    ownerScope: memoryOwnerScope,
                }),
                is_error: !result.success,
            });
            persistedToolResultContents.push(buildPersistedToolResultBlock({
                toolName: tu.name,
                toolUseId: tu.id,
                result,
                ownerScope: memoryOwnerScope,
            }));
        }
        messages.push({ role: "user", content: toolResultContents });
        insertMessage({
            id: crypto.randomUUID(),
            session_id: sessionId,
            root_run_id: runId,
            role: "user",
            content: "",
            tool_calls: JSON.stringify(persistedToolResultContents),
            tool_call_id: null,
            created_at: Date.now(),
        });
        const terminalFailure = getTerminalFailureNotice(executedToolResults);
        if (terminalFailure) {
            yield {
                type: "text",
                delta: terminalFailure.text,
                textSource: "runtime_deterministic",
                notice: terminalFailure.notice,
            };
            break;
        }
        const runScopedPreDispatchFailureSeen = executedToolResults.some(({ result }) => isRunScopedPreDispatchFailureDetails(result.details));
        if (!runScopedPreDispatchFailureSeen &&
            shouldStopAfterToolRound({
                source: ctx.source,
                toolResults: executedToolResults,
            })) {
            break;
        }
        if (executionRecoveryFailures.length > 0) {
            const latestRecoveryFailure = executionRecoveryFailures[executionRecoveryFailures.length - 1];
            yield {
                type: "execution_recovery",
                toolNames: [...new Set(executionRecoveryFailures.map((failure) => failure.toolName))],
                summary: buildExecutionRecoverySummary(executionRecoveryFailures),
                reason: buildExecutionRecoveryReason(executionRecoveryFailures),
                ...(latestRecoveryFailure?.reasonCode
                    ? { reasonCode: latestRecoveryFailure.reasonCode }
                    : {}),
                ...(latestRecoveryFailure?.evidenceRefs &&
                    latestRecoveryFailure.evidenceRefs.length > 0
                    ? { evidenceRefs: [...latestRecoveryFailure.evidenceRefs] }
                    : {}),
            };
        }
        if (runScopedPreDispatchFailureSeen) {
            break;
        }
        // Guard against runaway context
        if (totalTokens > MAX_CONTEXT_TOKENS) {
            log.warn("Context token limit approached — stopping tool loop");
            break;
        }
    }
    if (canonicalWebEvidenceEnabled &&
        !canonicalWebEvidenceCompleted &&
        attemptedWebMethodFingerprints.size > 0 &&
        lastCanonicalWebFailureReason) {
        yield {
            type: "execution_recovery",
            toolNames: ["web_search", "web_fetch"],
            summary: "웹 근거가 완료 조건을 충족하지 못해 변경된 방법 검토가 필요합니다.",
            reason: lastCanonicalWebFailureReason,
        };
    }
    if (webResearchRunRecorder && webResearchRunRecorder.snapshot().executionLedger.events.length > 0) {
        const webResearchState = webResearchRunRecorder.snapshot().machine.state;
        if (webResearchState === "CANDIDATES_READY" || webResearchState === "EVIDENCE_READY") {
            const verificationStarted = webResearchRunRecorder.startVerification();
            if (verificationStarted.ok) {
                webResearchRunRecorder.finishVerification({ outcome: "succeeded" });
            }
        }
        const trace = webResearchRunRecorder.snapshot();
        try {
            insertAuditLog({
                timestamp: Date.now(),
                session_id: sessionId,
                run_id: runId,
                request_group_id: params.requestGroupId ?? runId,
                channel: params.source ?? "cli",
                source: "agent",
                tool_name: "web_research_run_trace",
                params: JSON.stringify({
                    schemaVersion: trace.schemaVersion,
                    policyVersion: trace.policyVersion,
                    machineState: trace.machine.state,
                    attemptedMethods: trace.attemptedMethods,
                }),
                output: JSON.stringify({
                    executionLedger: trace.executionLedger,
                    evidenceLedger: trace.evidenceLedger,
                }),
                result: trace.machine.state === "COMPLETED" ? "success" : "failed",
                duration_ms: Date.now() - now,
                approval_required: 0,
                approved_by: null,
                error_code: trace.machine.state === "COMPLETED"
                    ? null
                    : trace.machine.lastFailureReasonCode,
                retry_count: Math.max(0, trace.attemptedMethods.length - 1),
                stop_reason: null,
            });
        }
        catch {
            log.fieldDebug("web_research_run_trace_audit_failed", { runId });
        }
    }
    const durationMs = Date.now() - now;
    eventBus.emit("agent.end", { sessionId, runId, durationMs });
    log.info(`Agent run ${runId} done in ${durationMs}ms (tokens≈${totalTokens})`);
    yield { type: "done", totalTokens };
}
function shouldStopAfterToolRound(params) {
    for (const toolResult of params.toolResults) {
        if (shouldTerminateRunAfterSuccessfulTool({
            type: "tool_end",
            toolName: toolResult.toolName,
            success: toolResult.result.success,
            output: toolResult.result.output,
            ...(toolResult.result.details !== undefined ? { details: toolResult.result.details } : {}),
        })) {
            return true;
        }
    }
    if (params.source !== "telegram") {
        return false;
    }
    return params.toolResults.some(({ toolName, result }) => toolName === "telegram_send_file" && !result.success);
}
function appendAgentLatencyEvent(runId, name, durationMs) {
    try {
        appendRunEvent(runId, `${name}=${Math.max(0, Math.floor(durationMs))}ms`);
    }
    catch {
        // Latency tracing must never affect model execution.
    }
}
function shouldSignalExecutionRecovery(toolName, result) {
    if (isRunScopedPreDispatchFailureDetails(result.details))
        return true;
    return (!result.success &&
        EXECUTION_RECOVERY_TOOL_NAMES.has(toolName) &&
        !isNonRecoverableExecutionToolFailure(result));
}
function buildPublicToolEndProjection(toolName, result) {
    const projectedResult = projectToolResultForExternalBoundary(toolName, result);
    if (toolName.startsWith("yeonjang_")) {
        const details = redactYeonjangPublicDetails(projectedResult.details);
        return {
            ...(projectedResult !== result ? { output: projectedResult.output } : {}),
            ...(details !== undefined ? { details } : {}),
        };
    }
    if (toolName === "web_search" || toolName === "web_fetch") {
        const details = projectedResult.details && typeof projectedResult.details === "object" &&
            !Array.isArray(projectedResult.details)
            ? { ...projectedResult.details }
            : undefined;
        if (details)
            delete details.internalObservedFetchCandidates;
        return {
            ...(details && Object.keys(details).length > 0 ? { details } : {}),
            ...(projectedResult.evidenceSource
                ? { evidenceSource: projectedResult.evidenceSource }
                : {}),
        };
    }
    return {
        ...(projectedResult.details !== undefined ? { details: projectedResult.details } : {}),
        ...(projectedResult.evidenceSource
            ? { evidenceSource: projectedResult.evidenceSource }
            : {}),
    };
}
function buildPersistedToolResultProjection(toolName, result) {
    const projectedResult = projectToolResultForExternalBoundary(toolName, result);
    if (toolName !== "web_search" && toolName !== "web_fetch")
        return projectedResult;
    const details = projectedResult.details && typeof projectedResult.details === "object" &&
        !Array.isArray(projectedResult.details)
        ? { ...projectedResult.details }
        : undefined;
    if (!details || !Object.hasOwn(details, "internalObservedFetchCandidates")) {
        return projectedResult;
    }
    delete details.internalObservedFetchCandidates;
    return {
        ...projectedResult,
        details: Object.keys(details).length > 0 ? details : undefined,
    };
}
export function buildPersistedToolResultBlock(input) {
    const projectedResult = buildPersistedToolResultProjection(input.toolName, input.result);
    return {
        type: "tool_result",
        tool_use_id: input.toolUseId,
        content: buildToolResultContent(input.toolName, projectedResult, {
            sourceRef: `tool:${input.toolName}:${input.toolUseId}`,
            ownerScope: input.ownerScope ?? MAIN_AGENT_MEMORY_OWNER_SCOPE,
        }),
        ...(!projectedResult.success ? { is_error: true } : {}),
    };
}
const CAMERA_PUBLIC_ARTIFACT_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
function projectToolResultForExternalBoundary(toolName, result) {
    if (toolName !== "yeonjang_camera_capture" || !result.success)
        return result;
    const details = result.details && typeof result.details === "object" &&
        !Array.isArray(result.details)
        ? result.details
        : {};
    const verification = details.kind === "camera_artifact" || details.kind === "artifact_delivery"
        ? details
        : details.artifactVerification &&
            typeof details.artifactVerification === "object" &&
            !Array.isArray(details.artifactVerification)
            ? details.artifactVerification
            : {};
    const artifactRef = (verification.status === "verified"
        || details.kind === "camera_artifact"
        || details.kind === "artifact_delivery") &&
        typeof verification.artifactRef === "string" &&
        verification.artifactRef.startsWith("artifact:")
        ? verification.artifactRef
        : undefined;
    const mimeType = typeof verification.mimeType === "string" &&
        CAMERA_PUBLIC_ARTIFACT_MIME_TYPES.has(verification.mimeType)
        ? verification.mimeType
        : undefined;
    const sizeBytes = typeof (verification.sizeBytes ?? verification.size) === "number" &&
        Number.isSafeInteger(verification.sizeBytes ?? verification.size) &&
        Number(verification.sizeBytes ?? verification.size) > 0
        ? Number(verification.sizeBytes ?? verification.size)
        : undefined;
    const artifact = artifactRef && mimeType && sizeBytes !== undefined
        ? { artifactRef, mimeType, sizeBytes }
        : undefined;
    const artifactDetails = artifact && details.kind === "artifact_delivery"
        ? {
            kind: "artifact_delivery",
            channel: details.channel,
            source: details.source,
            artifactRef: artifact.artifactRef,
            mimeType: artifact.mimeType,
            size: artifact.sizeBytes,
        }
        : artifact
            ? {
                kind: "camera_artifact",
                ...artifact,
            }
            : undefined;
    return {
        ...result,
        output: artifact
            ? "카메라 촬영 결과가 검증된 artifact로 저장되었습니다."
            : "카메라 촬영 작업이 검증되었습니다.",
        details: artifactDetails,
    };
}
function readInternalObservedFetchCandidates(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const candidates = value.internalObservedFetchCandidates;
    if (!Array.isArray(candidates))
        return [];
    return candidates.filter((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
            return false;
        const value = candidate;
        return (value.kind === "fetch" &&
            typeof value.candidateId === "string" &&
            typeof value.sourceUrl === "string" &&
            typeof value.evidenceRef === "string" &&
            typeof value.strategyFingerprint === "string" &&
            value.discovery?.origin === "fetched_document_link" &&
            typeof value.discovery.discoveryFingerprint === "string");
    });
}
function readValidatedSearchResults(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const details = value;
    if (details.kind !== "web_search_evidence" || !Array.isArray(details.results))
        return [];
    return details.results.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
            return [];
        const result = item;
        const sourceUrl = typeof result.url === "string" ? result.url.trim() : "";
        const evidenceRef = typeof result.evidenceRef === "string" ? result.evidenceRef.trim() : "";
        return sourceUrl && evidenceRef ? [{ sourceUrl, evidenceRef }] : [];
    });
}
const YEONJANG_PUBLIC_REDACTED_DETAIL_KEYS = new Set([
    "accesstoken",
    "apikey",
    "authorization",
    "base64",
    "base64data",
    "base64_data",
    "evidence",
    "expectedtext",
    "expected_text",
    "localsavedpath",
    "local_saved_path",
    "password",
    "raw",
    "rawpayload",
    "raw_payload",
    "replacementtext",
    "replacement_text",
    "secret",
    "token",
]);
function redactYeonjangPublicDetails(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (Array.isArray(value))
        return value.map((item) => redactYeonjangPublicDetails(item));
    if (typeof value !== "object")
        return value;
    const projected = {};
    for (const [key, item] of Object.entries(value)) {
        if (isYeonjangPublicRedactedDetailKey(key))
            continue;
        const redacted = redactYeonjangPublicDetails(item);
        if (redacted !== undefined)
            projected[key] = redacted;
    }
    return projected;
}
function isYeonjangPublicRedactedDetailKey(key) {
    const normalized = key.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (YEONJANG_PUBLIC_REDACTED_DETAIL_KEYS.has(normalized))
        return true;
    return (normalized.includes("token") ||
        normalized.includes("secret") ||
        normalized.includes("password") ||
        normalized.includes("base64") ||
        normalized.includes("rawpayload"));
}
function isNonRecoverableExecutionToolFailure(result) {
    return result.error === "CAMERA_FACING_SELECTION_UNSUPPORTED";
}
function getTerminalFailureNotice(toolResults) {
    for (const { toolName, result } of toolResults) {
        if (!result.success && shouldStopAfterFailure(result.details)) {
            const terminalFailure = buildTerminalFailureNotice(toolName, result);
            if (terminalFailure?.text)
                return terminalFailure;
        }
    }
    return null;
}
function buildTerminalFailureNotice(toolName, result) {
    const output = result.output.trim();
    if (!output)
        return null;
    const trusted = isTrustedDeterministicTerminalFailure(result);
    const text = trusted ? output : sanitizeUserFacingError(output).userMessage;
    if (!text.trim())
        return null;
    return {
        text,
        notice: buildAgentTerminalFailureNotice({
            toolName,
            failureTrust: trusted ? "trusted_deterministic" : "sanitized_tool_failure",
            reason: terminalFailureReason(result, text, trusted),
        }),
    };
}
function terminalFailureReason(result, text, trusted) {
    if (trusted && result.details && typeof result.details === "object") {
        const failureKind = result.details.failureKind?.trim();
        if (failureKind)
            return failureKind;
    }
    const error = result.error?.trim();
    if (error)
        return sanitizeUserFacingError(error).reason;
    return text;
}
function shouldStopAfterFailure(details) {
    if (!details || typeof details !== "object")
        return false;
    return Boolean(details.stopAfterFailure);
}
function isTrustedDeterministicTerminalFailure(result) {
    if (!result.details || typeof result.details !== "object")
        return false;
    const typed = result.details;
    if (typed.via !== "yeonjang")
        return false;
    if (typed.failureKind === "path_bug" || typed.failureKind === "timeout")
        return true;
    const failure = typed.failure;
    return (typed.failureKind === "remote_rejected"
        && result.output.trim() === TRUSTED_SCREEN_PERMISSION_DENIED_OUTPUT
        && failure?.reasonCode === "screen_permission_denied"
        && failure.terminalStage === "rejected"
        && failure.retrySafety === "change_strategy");
}
function buildExecutionRecoverySummary(failures) {
    const toolNames = [...new Set(failures.map((failure) => failure.toolName))];
    if (toolNames.length === 0) {
        return "실행 실패 원인을 분석하고 다른 방법을 다시 시도합니다.";
    }
    if (toolNames.length === 1) {
        const summary = failures[failures.length - 1]?.summary?.trim();
        if (summary)
            return summary;
        return `${toolNames[0]} 실패 원인을 분석하고 다른 방법을 다시 시도합니다.`;
    }
    return `${toolNames.join(", ")} 실패 원인을 분석하고 대안을 다시 시도합니다.`;
}
function buildExecutionRecoveryReason(failures) {
    const latest = failures[failures.length - 1];
    const projectedReason = latest?.reason?.trim();
    if (projectedReason)
        return projectedReason;
    const latestOutput = latest?.output ?? "";
    if (/(not found|command not found|enoent|is not recognized)/i.test(latestOutput)) {
        return "실행 대상 명령이나 프로그램을 찾지 못했습니다.";
    }
    if (/(permission denied|operation not permitted|eacces|not authorized|권한)/i.test(latestOutput)) {
        return "권한 또는 접근 제한으로 작업 실행이 실패했습니다.";
    }
    if (/(no such file|cannot find|not a directory|경로|파일을 찾을 수 없음)/i.test(latestOutput)) {
        return "대상 경로나 파일 이름이 맞지 않아 작업이 실패했습니다.";
    }
    if (/(timeout|timed out|시간 초과)/i.test(latestOutput)) {
        return "시간 초과로 작업 실행이 실패했습니다.";
    }
    const latestError = latest?.error?.trim();
    if (!latestError)
        return "작업 실행이 실패해 다른 방법 검토가 필요합니다.";
    const sanitized = sanitizeUserFacingError(latestError);
    return sanitized.kind === "unknown"
        ? "작업 실행이 실패해 다른 방법 검토가 필요합니다."
        : sanitized.userMessage;
}
function describeAiErrorReason(message) {
    return sanitizeUserFacingError(message).reason;
}
function buildToolResultContent(toolName, result, provenance) {
    const projectedResult = projectToolResultForExternalBoundary(toolName, result);
    const sections = [];
    const output = projectedResult.output.trim();
    sections.push(output || agentRuntimePromptContextLabel("no_output"));
    if (!projectedResult.success) {
        sections.push([
            agentRuntimePromptContextLabel("tool_failure_header"),
            `${agentRuntimePromptContextLabel("tool_label")} ${toolName}`,
            `${agentRuntimePromptContextLabel("error_label")} ${(projectedResult.error ?? "unknown").trim() || "unknown"}`,
        ].join("\n"));
    }
    const promptDetails = toolName.startsWith("yeonjang_")
        ? redactYeonjangPublicDetails(projectedResult.details)
        : projectedResult.details;
    const details = stringifyToolDetails(promptDetails);
    if (details) {
        sections.push(`${agentRuntimePromptContextLabel("details_header")}\n${details}`);
    }
    return renderUntrustedEvidenceForPrompt(createUntrustedEvidenceEnvelope({
        sourceKind: projectedResult.evidenceSource?.sourceKind ?? "tool",
        sourceRef: projectedResult.evidenceSource?.sourceRef ?? provenance.sourceRef,
        contentLabel: `Tool result: ${toolName}`,
        ownerScope: provenance.ownerScope,
        content: sections.join("\n\n"),
        redactionState: "not_required",
    }));
}
function stringifyToolDetails(details) {
    if (details == null)
        return null;
    try {
        const text = JSON.stringify(details, null, 2);
        if (!text || text === "{}")
            return null;
        return text.length > 4000 ? `${text.slice(0, 3999)}…` : text;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=index.js.map