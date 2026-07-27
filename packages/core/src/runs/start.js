import { resolveMainAgentSelfName, resolvePromptLocaleForRequest, } from "../agent/main-agent-identity.js";
import { attachCapabilityProfileToTrace, getProviderCapabilityMatrix } from "../ai/capabilities.js";
import { formatProviderAuditTrace, getProvider, resolveProviderResolutionSnapshot, } from "../ai/index.js";
import { readInstructionSkillSource } from "../capabilities/instruction-skill-filesystem.js";
import { intentContractFromTaskIntentEnvelope } from "../contracts/intake-adapter.js";
import { insertDiagnosticEvent, listAgentCapabilityBindings, listSkillCatalogEntries, } from "../db/index.js";
import { SqliteLlmInvocationReceiptRepository } from "../db/llm-invocation-receipt-repository.js";
import { createLogger, redactLogText } from "../logger/index.js";
import { mcpRegistry } from "../mcp/registry.js";
import { getMqttExtensionSnapshots } from "../mqtt/broker.js";
import { buildLatencyEventLabel, recordLatencyMetric } from "../observability/latency.js";
import { toolDispatcher } from "../tools/runtime-dispatcher.js";
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js";
import { projectCapabilitySelectionCatalog } from "./capability-selection-catalog.js";
import { createSqliteCapabilitySelectionDecisionTraceSink } from "./capability-selection-decision-trace-adapter.js";
import { createRuntimeCapabilitySelectionProvider } from "./capability-selection-provider-runtime.js";
import { createRuntimeDiagnosisProviderPair } from "./diagnosis-provider-runtime.js";
import { enqueueRequestGroupExecution, hasRequestGroupExecutionQueue } from "./execution-queue.js";
import { buildFinalResponseIdentityContext, } from "./final-response-renderer.js";
import { emitStandaloneAssistantMessage, } from "./finalization.js";
import { dispatchDelegatedSubAgentTasks } from "./orchestration-dispatch.js";
import { loadInstructionSkillSnapshots } from "./instruction-skill-snapshot.js";
import { resolveStartContextPlan } from "./preflight.js";
import { executeRootRunDriver } from "./root-run-driver.js";
import { projectMcpRuntimeHealthObservations, projectYeonjangRuntimeHealthObservations, } from "./runtime-capability-health.js";
import { buildStartRootRunDriverDependencies } from "./start-driver-dependencies.js";
import { createFirstResponseDeadline } from "./first-response-deadline.js";
import { prepareStartLaunch } from "./start-launch.js";
import { buildStartPreflightFailureNotice } from "./start-preflight-notice.js";
import { rememberRunFailure } from "./start-support.js";
import { appendRunEvent, clearActiveRunController, getRootRun, setRunStepStatus, updateRunStatus, updateRunSummary, } from "./store.js";
import { buildTopologyDispatchFollowupDirective, recordTopologyDispatchFollowupTrace, resolveTopologyDispatchFollowupDecision, } from "./topology-dispatch-fallback.js";
const log = createLogger("runs:start");
const syntheticApprovalScopes = new Set();
function safeRunErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
export function shouldDispatchPreAnalyzedRootDelegation(input) {
    return (input.isRootRequest &&
        !input.hasParentRun &&
        input.runScope !== "child" &&
        input.skipIntake &&
        input.orchestrationMode === "orchestration" &&
        input.delegatedTaskCount > 0);
}
export function resolveStartResponseRuntime(params) {
    const model = params.requestedModel?.trim() || params.providerTrace?.modelId.trim();
    const providerId = params.requestedProviderId?.trim() || params.providerTrace?.providerId.trim();
    return {
        ...(model ? { model } : {}),
        ...(providerId ? { providerId } : {}),
    };
}
async function failStartPreflight(params) {
    appendRunEvent(params.runId, params.failure.eventLabel);
    setRunStepStatus(params.runId, "executing", "failed", params.failure.userMessage);
    updateRunStatus(params.runId, "failed", params.failure.summary, false);
    rememberRunFailure({
        memoryJournal: params.memoryJournal,
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        summary: params.failure.summary,
        detail: params.failure.userMessage,
        title: params.failure.code,
    });
    await emitStandaloneAssistantMessage({
        runId: params.runId,
        sessionId: params.sessionId,
        text: params.failure.userMessage,
        textSource: "runtime_deterministic",
        notice: buildStartPreflightFailureNotice(params.failure),
        ...(params.responseContext ? { responseContext: params.responseContext } : {}),
        source: params.source,
        onChunk: params.onChunk,
        dependencies: {
            appendRunEvent,
            onDeliveryError: (message) => params.logWarn(message),
        },
    });
    clearActiveRunController(params.runId);
    return getRootRun(params.runId);
}
export function buildStartPreflightResponseContext(params) {
    if (!params.originalRequest.trim() || !params.model?.trim() || !params.workDir.trim())
        return undefined;
    if (!params.provider && !params.providerId?.trim())
        return undefined;
    return {
        originalRequest: params.originalRequest,
        ...(params.responseLanguageMode ? { responseLanguageMode: params.responseLanguageMode } : {}),
        model: params.model,
        ...(params.providerId ? { providerId: params.providerId } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        config: params.config,
        workDir: params.workDir,
        ...(params.identityContext ? { identityContext: params.identityContext } : {}),
    };
}
export function startRootRun(params) {
    const monotonicNow = () => performance.now();
    const firstResponseDeadline = createFirstResponseDeadline(params.firstResponseReceivedAtMs ?? monotonicNow());
    const sessionId = params.sessionId ?? crypto.randomUUID();
    const runId = params.runId ?? crypto.randomUUID();
    const controller = new AbortController();
    const targetId = params.targetId?.trim() ? params.targetId : undefined;
    const now = Date.now();
    const workDir = params.workDir ?? params.config.profile.workspace;
    const incomingIntentContract = params.intentEnvelope
        ? intentContractFromTaskIntentEnvelope(params.intentEnvelope)
        : undefined;
    const finished = (async () => {
        const runtimeConfig = params.config;
        const providerTrace = params.providerTrace ??
            (() => {
                try {
                    const snapshot = resolveProviderResolutionSnapshot(params.providerId, runtimeConfig);
                    const matrix = getProviderCapabilityMatrix({
                        connection: runtimeConfig.ai.connection,
                        memory: runtimeConfig.memory,
                    });
                    return attachCapabilityProfileToTrace(snapshot.auditTrace, matrix);
                }
                catch {
                    return undefined;
                }
            })();
        const responseRuntime = resolveStartResponseRuntime({
            requestedModel: params.model,
            requestedProviderId: params.providerId,
            providerTrace,
        });
        const maxDelegationTurns = runtimeConfig.orchestration.maxDelegationTurns;
        const parentAgentName = resolveMainAgentSelfName(runtimeConfig, resolvePromptLocaleForRequest(runtimeConfig.profile.language, params.message));
        const finalResponseIdentityContext = buildFinalResponseIdentityContext({
            config: runtimeConfig,
            originalRequest: params.message,
            workDir,
        });
        const startLaunch = await prepareStartLaunch({
            memoryJournal: params.memoryJournal,
            message: params.message,
            sessionId,
            runId,
            ...(params.targetRunId ? { targetRunId: params.targetRunId } : {}),
            source: params.source,
            ...(incomingIntentContract ? { incomingIntentContract } : {}),
            controller,
            now,
            maxDelegationTurns,
            ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
            ...(params.lineageRootRunId ? { lineageRootRunId: params.lineageRootRunId } : {}),
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.originRunId ? { originRunId: params.originRunId } : {}),
            ...(params.originRequestGroupId ? { originRequestGroupId: params.originRequestGroupId } : {}),
            ...(params.forceRequestGroupReuse
                ? { forceRequestGroupReuse: params.forceRequestGroupReuse }
                : {}),
            ...(params.contextMode ? { contextMode: params.contextMode } : {}),
            ...(params.taskProfile ? { taskProfile: params.taskProfile } : {}),
            ...(params.runScope ? { runScope: params.runScope } : {}),
            ...(params.handoffSummary ? { handoffSummary: params.handoffSummary } : {}),
            ...(targetId ? { targetId } : {}),
            ...(params.targetLabel?.trim() ? { targetLabel: params.targetLabel.trim() } : {}),
            mainAgentNameSnapshot: parentAgentName,
            ...(responseRuntime.model ? { model: responseRuntime.model } : {}),
            ...(params.workerRuntime ? { workerRuntime: params.workerRuntime } : {}),
            ...(params.orchestrationPlannerIntent
                ? { orchestrationPlannerIntent: params.orchestrationPlannerIntent }
                : {}),
            ...(params.agentExecutionDecision
                ? { agentExecutionDecision: params.agentExecutionDecision }
                : {}),
            ...(params.agentExecutionDecisionTrace
                ? { agentExecutionDecisionTrace: params.agentExecutionDecisionTrace }
                : {}),
            ...(params.inboundMessage ? { inboundMessage: params.inboundMessage } : {}),
            config: runtimeConfig,
            hasRequestGroupExecutionQueue,
        });
        appendRunEvent(runId, `preflight_ms=${Date.now() - now}`);
        if (providerTrace)
            appendRunEvent(runId, formatProviderAuditTrace(providerTrace));
        const { startPlan } = startLaunch;
        appendRunEvent(runId, `orchestration_mode: ${startPlan.orchestrationMode} (${startPlan.orchestrationRegistrySnapshot.reasonCode})`);
        if (startPlan.orchestrationRegistrySnapshot.status === "degraded") {
            try {
                insertDiagnosticEvent({
                    kind: "orchestration.registry.degraded",
                    summary: startPlan.orchestrationRegistrySnapshot.reason,
                    runId,
                    sessionId,
                    requestGroupId: startPlan.requestGroupId,
                    recoveryKey: startPlan.orchestrationRegistrySnapshot.reasonCode,
                    detail: {
                        mode: startPlan.orchestrationRegistrySnapshot.mode,
                        reasonCode: startPlan.orchestrationRegistrySnapshot.reasonCode,
                        activeSubAgentCount: startPlan.orchestrationRegistrySnapshot.activeSubAgentCount,
                    },
                });
            }
            catch (error) {
                const message = safeRunErrorMessage(error);
                log.warn("failed to record orchestration degraded diagnostic", {
                    runId,
                    error: message,
                });
            }
        }
        for (const latencyEvent of startPlan.latencyEvents)
            appendRunEvent(runId, latencyEvent);
        const { entrySemantics, reconnectTarget, reconnectNeedsClarification, requestGroupId, isRootRequest, effectiveTaskProfile, effectiveContextMode, workerSessionId, topologyRouting, } = startPlan;
        const suppressFinalDelivery = params.runScope === "child" || Boolean(params.parentRunId);
        const effectiveOnChunk = suppressFinalDelivery ? undefined : params.onChunk;
        const queuedBehindRequestGroupRun = startLaunch.queuedBehindRequestGroupRun;
        const canonicalPolicyTools = toolDispatcher.getAll();
        const canonicalPolicySnapshotAt = Date.now();
        const canonicalRuntimeHealthObservations = [
            ...projectMcpRuntimeHealthObservations({
                statuses: mcpRegistry.getStatuses(),
                observedAt: canonicalPolicySnapshotAt,
            }),
            ...projectYeonjangRuntimeHealthObservations({
                instances: listYeonjangRegistryInstances({ now: canonicalPolicySnapshotAt }),
                tools: canonicalPolicyTools,
                methodSnapshots: getMqttExtensionSnapshots().map((snapshot) => ({
                    instanceId: snapshot.instanceId?.trim() || snapshot.extensionId,
                    methods: [...snapshot.methods],
                })),
                observedAt: canonicalPolicySnapshotAt,
            }),
        ];
        const canonicalYeonjangAgentBindings = listAgentCapabilityBindings({
            capabilityKind: "yeonjang",
            enabledOnly: true,
        }).map((binding) => ({
            agentId: binding.agent_id,
            targetId: `yeonjang:${binding.catalog_id}`,
        }));
        const capabilitySelectionOwnerAgentId = runtimeConfig.orchestration.knowbee?.agentId?.trim() || "agent:knowbee";
        const capabilitySelectionCatalog = projectCapabilitySelectionCatalog({
            ownerAgentId: capabilitySelectionOwnerAgentId,
            catalogEntries: listSkillCatalogEntries({ includeArchived: true }).map((entry) => ({
                skillId: entry.skill_id,
                status: entry.status,
                risk: entry.risk,
                toolNamesJson: entry.tool_names_json,
                metadataJson: entry.metadata_json,
            })),
            bindings: listAgentCapabilityBindings({
                agentId: capabilitySelectionOwnerAgentId,
                capabilityKind: "skill",
                includeArchived: true,
            }).map((binding) => ({
                agentId: binding.agent_id,
                catalogId: binding.catalog_id,
                status: binding.status,
                enabledToolNamesJson: binding.enabled_tool_names_json,
                disabledToolNamesJson: binding.disabled_tool_names_json,
            })),
        });
        const instructionSkillSnapshot = loadInstructionSkillSnapshots({
            skills: capabilitySelectionCatalog.ok
                ? capabilitySelectionCatalog.instructionSkills
                : [],
            maxSourceBytes: 64 * 1024,
            maxTotalBytes: 256 * 1024,
        }, { readSource: readInstructionSkillSource });
        let capabilitySelectionAiProvider = params.provider;
        if (!capabilitySelectionAiProvider) {
            try {
                capabilitySelectionAiProvider = getProvider(responseRuntime.providerId, runtimeConfig);
            }
            catch {
                capabilitySelectionAiProvider = undefined;
            }
        }
        const capabilitySelectionProvider = createRuntimeCapabilitySelectionProvider({
            ...(capabilitySelectionAiProvider ? { provider: capabilitySelectionAiProvider } : {}),
            ...(responseRuntime.model ? { model: responseRuntime.model } : {}),
            workDir,
            observabilityContext: { runId, requestGroupId, sessionId },
        });
        log.fieldDebug(capabilitySelectionProvider.fieldDebugEvent);
        const { syntheticApprovalRuntimeDependencies, driverDependencies } = buildStartRootRunDriverDependencies({
            artifactStorage: params.artifactStorage,
            memoryJournal: params.memoryJournal,
            hierarchyStorage: params.hierarchyStorage,
            runId,
            controller,
            sessionId,
            requestGroupId,
            source: params.source,
            onChunk: effectiveOnChunk,
            message: params.message,
            ...((params.responseLanguageMode ?? params.structuredRequest?.response_language_mode)
                ? {
                    responseLanguageMode: params.responseLanguageMode ?? params.structuredRequest?.response_language_mode,
                }
                : {}),
            model: responseRuntime.model,
            ...(responseRuntime.providerId ? { providerId: responseRuntime.providerId } : {}),
            ...(params.provider ? { provider: params.provider } : {}),
            workDir,
            config: runtimeConfig,
            canonicalPolicyTools,
            canonicalPolicySnapshotAt,
            canonicalRuntimeHealthObservations,
            canonicalYeonjangAgentBindings,
            capabilitySelection: {
                ownerAgentId: capabilitySelectionOwnerAgentId,
                skillDefinitions: capabilitySelectionCatalog.ok ? capabilitySelectionCatalog.skillDefinitions : [],
                skillBindings: capabilitySelectionCatalog.ok ? capabilitySelectionCatalog.skillBindings : [],
                instructionSkills: instructionSkillSnapshot.snapshots,
                instructionSkillFindings: instructionSkillSnapshot.findings,
                ...(!capabilitySelectionCatalog.ok
                    ? { setupFailureReasonCode: capabilitySelectionCatalog.reasonCode }
                    : {}),
                ...(capabilitySelectionProvider.status === "ready"
                    ? { provider: capabilitySelectionProvider.capabilitySelectionProvider }
                    : {}),
                traceSink: createSqliteCapabilitySelectionDecisionTraceSink({
                    requestGroupId,
                    sessionId,
                    source: params.source,
                    receiptRepository: new SqliteLlmInvocationReceiptRepository(),
                }),
                externalTransferAllowed: true,
                maxCost: "high",
            },
            toolsEnabled: params.toolsEnabled !== false,
            finalResponseIdentityContext,
            reuseConversationContext: entrySemantics.reuse_conversation_context,
            ...(suppressFinalDelivery ? { suppressFinalDelivery: true } : {}),
            activeQueueCancellationMode: entrySemantics.active_queue_cancellation_mode,
            startNestedRootRun: startRootRun,
            syntheticApprovalScopes,
            logInfo: (message, payload) => log.info(message, payload),
            logFieldDebug: (message, payload) => log.fieldDebug(message, payload),
            logWarn: (message) => log.warn(message),
            logError: (message, payload) => log.error(message, payload),
            monotonicNow,
            firstResponseDeadline,
        });
        const contextPlan = resolveStartContextPlan({
            source: params.source,
            message: params.message,
            ...(responseRuntime.model ? { model: responseRuntime.model } : {}),
            ...(responseRuntime.providerId ? { providerId: responseRuntime.providerId } : {}),
            ...(params.provider ? { provider: params.provider } : {}),
            ...(effectiveOnChunk ? { onChunk: effectiveOnChunk } : {}),
            ...(params.immediateCompletionText
                ? { immediateCompletionText: params.immediateCompletionText }
                : {}),
            ...(topologyRouting.mode === "route" && !params.immediateCompletionText
                ? { immediateCompletionText: "topology-runtime" }
                : {}),
            ...(params.toolsEnabled === false ? { toolsEnabled: params.toolsEnabled } : {}),
            ...(params.executionSemantics ? { executionSemantics: params.executionSemantics } : {}),
            ...(targetId ? { targetId } : {}),
            ...(params.workerRuntime ? { workerRuntime: params.workerRuntime } : {}),
            ...(params.contextMode ? { contextMode: params.contextMode } : {}),
            ...(params.runScope ? { runScope: params.runScope } : {}),
            ...(params.skipIntake ? { skipIntake: params.skipIntake } : {}),
            config: runtimeConfig,
        });
        appendRunEvent(runId, `context_plan: memory=${contextPlan.memoryScopes.join(",")}; tools=${contextPlan.toolPolicy.toolsEnabled ? "enabled" : "disabled"}; yeonjang=${contextPlan.toolPolicy.requiresYeonjang ? "required" : "not_required"}`);
        const preflightFailure = contextPlan.preflightFailure;
        if (preflightFailure) {
            const preflightResponseContext = buildStartPreflightResponseContext({
                originalRequest: params.message,
                ...((params.responseLanguageMode ?? params.structuredRequest?.response_language_mode)
                    ? {
                        responseLanguageMode: params.responseLanguageMode ?? params.structuredRequest?.response_language_mode,
                    }
                    : {}),
                model: responseRuntime.model,
                ...(responseRuntime.providerId ? { providerId: responseRuntime.providerId } : {}),
                ...(params.provider ? { provider: params.provider } : {}),
                config: runtimeConfig,
                workDir,
                identityContext: finalResponseIdentityContext,
            });
            return await failStartPreflight({
                memoryJournal: params.memoryJournal,
                failure: preflightFailure,
                runId,
                sessionId,
                source: params.source,
                onChunk: effectiveOnChunk,
                ...(preflightResponseContext ? { responseContext: preflightResponseContext } : {}),
                logWarn: (message) => log.warn(message),
            });
        }
        return enqueueRequestGroupExecution({
            requestGroupId,
            runId,
            task: async () => {
                const executionStartedAt = Date.now();
                let executionMessage = params.message;
                let topologyDelegatedDispatchAttempted = false;
                let topologyDispatchFollowupDecision;
                const topologyAgentIds = new Set(startPlan.orchestrationRegistrySnapshot.activeSubAgents
                    .filter((agent) => agent.source === "topology")
                    .map((agent) => agent.agentId));
                const hasTopologyDelegatedTasks = startPlan.orchestrationPlanSnapshot.delegatedTasks.some((task) => task.assignedAgentId !== undefined && topologyAgentIds.has(task.assignedAgentId));
                try {
                    if (shouldDispatchPreAnalyzedRootDelegation({
                        isRootRequest,
                        hasParentRun: Boolean(params.parentRunId),
                        runScope: params.runScope,
                        skipIntake: params.skipIntake === true,
                        orchestrationMode: startPlan.orchestrationMode,
                        delegatedTaskCount: startPlan.orchestrationPlanSnapshot.delegatedTasks.length,
                    })) {
                        try {
                            setRunStepStatus(runId, "executing", "running", "서브 에이전트에게 작업을 위임했고 결과를 기다리고 있습니다.");
                            updateRunStatus(runId, "running", "서브 에이전트에게 작업을 위임했고 결과를 기다리고 있습니다.", false);
                            appendRunEvent(runId, "parent_run_awaiting_child_result:sub_agent_dispatch");
                            const diagnosisProviderResolution = createRuntimeDiagnosisProviderPair({
                                provider: params.provider,
                                model: responseRuntime.model,
                                workDir,
                                observabilityContext: { runId, requestGroupId, sessionId },
                            });
                            appendRunEvent(runId, diagnosisProviderResolution.fieldDebugEvent);
                            const dispatchResult = await dispatchDelegatedSubAgentTasks({
                                artifactStorage: params.artifactStorage,
                                memoryJournal: params.memoryJournal,
                                hierarchyStorage: params.hierarchyStorage,
                                plan: startPlan.orchestrationPlanSnapshot,
                                parentRunId: runId,
                                parentAgentName,
                                parentSessionId: sessionId,
                                parentRequestGroupId: requestGroupId,
                                source: params.source,
                                message: params.message,
                                ...(params.originalRequest ? { originalRequest: params.originalRequest } : {}),
                                workDir,
                                controller,
                            }, {
                                config: runtimeConfig,
                                startSubAgentRun: startRootRun,
                                appendParentEvent: appendRunEvent,
                                updateParentSummary: updateRunSummary,
                                ...(diagnosisProviderResolution.status === "ready"
                                    ? {
                                        diagnosisProvider: diagnosisProviderResolution.diagnosisProvider,
                                        diagnosisRepairProvider: diagnosisProviderResolution.diagnosisRepairProvider,
                                    }
                                    : {}),
                            });
                            appendRunEvent(runId, `sub_agent_dispatch_summary:attempted=${dispatchResult.attempted};completed=${dispatchResult.completed};failed=${dispatchResult.failed};skipped=${dispatchResult.skipped}`);
                            if (hasTopologyDelegatedTasks && dispatchResult.attempted > 0) {
                                topologyDelegatedDispatchAttempted = true;
                                topologyDispatchFollowupDecision = resolveTopologyDispatchFollowupDecision({
                                    dispatchResult,
                                    plan: startPlan.orchestrationPlanSnapshot,
                                    currentExecutorId: "agent:knowbee",
                                    availableDirectChildExecutorIds: topologyRouting.mode === "route"
                                        ? topologyRouting.availableDirectChildExecutorIds
                                        : [],
                                });
                                if (topologyDispatchFollowupDecision && topologyRouting.mode === "route") {
                                    const traceResult = recordTopologyDispatchFollowupTrace({
                                        decision: topologyDispatchFollowupDecision,
                                        dispatchResult,
                                        plan: startPlan.orchestrationPlanSnapshot,
                                        runId,
                                        requestGroupId,
                                        sessionId,
                                        source: params.source,
                                        topologyId: topologyRouting.topologyId,
                                        entryNodeId: topologyRouting.selectedExecutorId ?? topologyRouting.entryNodeId,
                                    });
                                    appendRunEvent(runId, `topology_dispatch_followup_trace:${traceResult.topologyRunId};decision_trace=${traceResult.decisionTraceId};events=${traceResult.traceEventCount}`);
                                }
                            }
                            const subAgentContext = dispatchResult.outcomes
                                .filter((outcome) => outcome.status !== "skipped")
                                .map((outcome) => [
                                `- task=${outcome.taskId}`,
                                outcome.agentName ? `executor=${outcome.agentName}` : undefined,
                                outcome.agentSource ? `source=${outcome.agentSource}` : undefined,
                                outcome.agentId ? `agent=${outcome.agentId}` : undefined,
                                outcome.topologyId ? `topology=${outcome.topologyId}` : undefined,
                                outcome.topologyExecutorId
                                    ? `topologyExecutor=${outcome.topologyExecutorId}`
                                    : undefined,
                                outcome.subSessionId ? `subSession=${outcome.subSessionId}` : undefined,
                                outcome.childRunId ? `childRun=${outcome.childRunId}` : undefined,
                                `status=${outcome.status}`,
                                outcome.reasonCode ? `reason=${outcome.reasonCode}` : undefined,
                                outcome.summary ? `summary=${outcome.summary}` : undefined,
                            ]
                                .filter(Boolean)
                                .join("; "))
                                .join("\n");
                            if (subAgentContext.trim()) {
                                executionMessage = `${params.message}\n\n# Sub-agent execution results\n${subAgentContext}`;
                            }
                        }
                        catch (error) {
                            const message = safeRunErrorMessage(error);
                            appendRunEvent(runId, `sub_agent_dispatch_failed:${message}`);
                            log.warn("sub-agent dispatch failed", {
                                runId,
                                error: message,
                            });
                        }
                    }
                    if (topologyDelegatedDispatchAttempted && topologyRouting.mode === "route") {
                        appendRunEvent(runId, `topology_runtime_deferred_to_sub_agent_dispatch:${topologyRouting.topologyId}:selected=${topologyRouting.selectedExecutorId ?? "unselected"}`);
                    }
                    if (topologyDispatchFollowupDecision) {
                        appendRunEvent(runId, `topology_dispatch_followup_decision:${topologyDispatchFollowupDecision.action};reason=${topologyDispatchFollowupDecision.reasonCode};failed=${topologyDispatchFollowupDecision.failedExecutorIds.join(",") || "none"}`);
                        if (topologyDispatchFollowupDecision.action === "self_solve") {
                            appendRunEvent(runId, "delegated_executor_runtime_failure_direct_current_agent:self_solve_after_delegation_failure");
                        }
                        else {
                            const directive = buildTopologyDispatchFollowupDirective(topologyDispatchFollowupDecision);
                            if (directive) {
                                await driverDependencies.executeLoopDirective(directive);
                            }
                            appendRunEvent(runId, `topology_dispatch_followup_blocked_root_loop:${topologyDispatchFollowupDecision.action};reason=${topologyDispatchFollowupDecision.reasonCode}`);
                            return getRootRun(runId);
                        }
                    }
                    const skipIntakeForTopologyDispatch = params.skipIntake === true || topologyDelegatedDispatchAttempted;
                    const driverTopologyRouting = topologyDelegatedDispatchAttempted
                        ? undefined
                        : topologyRouting;
                    await executeRootRunDriver({
                        artifactStorage: params.artifactStorage,
                        memoryJournal: params.memoryJournal,
                        runId,
                        sessionId,
                        requestGroupId,
                        source: params.source,
                        onChunk: effectiveOnChunk,
                        controller,
                        message: executionMessage,
                        ...(params.originalRequest || executionMessage !== params.message
                            ? { originalRequest: params.originalRequest ?? params.message }
                            : {}),
                        ...(params.executionSemantics
                            ? { executionSemantics: params.executionSemantics }
                            : {}),
                        ...(params.structuredRequest
                            ? { structuredRequest: params.structuredRequest }
                            : {}),
                        ...(params.intentEnvelope ? { intentEnvelope: params.intentEnvelope } : {}),
                        currentModel: responseRuntime.model,
                        currentProviderId: responseRuntime.providerId,
                        currentProvider: params.provider,
                        currentTargetId: targetId,
                        currentTargetLabel: params.targetLabel,
                        workDir,
                        config: runtimeConfig,
                        finalResponseIdentityContext,
                        ...(skipIntakeForTopologyDispatch ? { skipIntake: true } : {}),
                        ...(params.immediateCompletionText
                            ? { immediateCompletionText: params.immediateCompletionText }
                            : {}),
                        reconnectNeedsClarification,
                        ...(reconnectTarget ? { reconnectTargetTitle: reconnectTarget.title } : {}),
                        queuedBehindRequestGroupRun,
                        activeWorkerRuntime: params.workerRuntime,
                        ...(workerSessionId ? { workerSessionId } : {}),
                        ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
                        isRootRequest,
                        ...(suppressFinalDelivery ? { suppressFinalDelivery: true } : {}),
                        contextMode: effectiveContextMode,
                        taskProfile: effectiveTaskProfile,
                        ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
                        ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
                        ...(params.memorySearchQuery
                            ? { memorySearchQuery: params.memorySearchQuery }
                            : {}),
                        ...(driverTopologyRouting ? { topologyRouting: driverTopologyRouting } : {}),
                        syntheticApprovalRuntimeDependencies,
                        defaultMaxDelegationTurns: maxDelegationTurns,
                    }, driverDependencies);
                }
                finally {
                    appendRunEvent(runId, buildLatencyEventLabel(recordLatencyMetric({
                        name: "execution_latency_ms",
                        durationMs: Date.now() - executionStartedAt,
                        runId,
                        sessionId,
                        requestGroupId,
                        source: params.source,
                    })));
                }
                return getRootRun(runId);
            },
        }, {
            getRootRun,
            appendRunEvent,
            onAdmissionRejected: async ({ pendingCount }) => {
                const failure = {
                    code: "execution_queue_full",
                    summary: "Interactive execution queue admission was rejected.",
                    userMessage: "현재 요청 그룹의 실행 대기열이 가득 차서 이 요청을 시작하지 않았습니다. 진행 중인 작업이 끝난 뒤 다시 요청해 주세요.",
                    eventLabel: `execution_queue_admission_rejected:queue_full;pending=${pendingCount}`,
                };
                const responseContext = buildStartPreflightResponseContext({
                    originalRequest: params.message,
                    ...((params.responseLanguageMode ?? params.structuredRequest?.response_language_mode)
                        ? {
                            responseLanguageMode: params.responseLanguageMode ??
                                params.structuredRequest?.response_language_mode,
                        }
                        : {}),
                    model: responseRuntime.model,
                    ...(responseRuntime.providerId ? { providerId: responseRuntime.providerId } : {}),
                    ...(params.provider ? { provider: params.provider } : {}),
                    config: runtimeConfig,
                    workDir,
                    identityContext: finalResponseIdentityContext,
                });
                return failStartPreflight({
                    memoryJournal: params.memoryJournal,
                    failure,
                    runId,
                    sessionId,
                    source: params.source,
                    onChunk: effectiveOnChunk,
                    ...(responseContext ? { responseContext } : {}),
                    logWarn: (message) => log.warn(message),
                });
            },
            logInfo: (message, payload) => log.info(message, payload),
            logWarn: (message) => log.warn(message),
            logError: (message, payload) => log.error(message, payload),
        });
    })().catch((error) => {
        const message = safeRunErrorMessage(error);
        log.error("start root run failed", {
            runId,
            sessionId,
            error: message,
        });
        return undefined;
    });
    return {
        runId,
        sessionId,
        status: "started",
        finished,
    };
}
//# sourceMappingURL=start.js.map