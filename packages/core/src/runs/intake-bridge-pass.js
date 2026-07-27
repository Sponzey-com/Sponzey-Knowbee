import { detectAvailableProvider, getDefaultModel, getProvider, } from "../ai/index.js";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { createInstructionRuntimeContext } from "../instructions/merge.js";
import { buildScheduleRegistrationCancelledEvent, buildScheduleRegistrationCreatedEvent, } from "../scheduler/lifecycle.js";
import { analyzeTaskIntakeOutcome, isTaskIntakeAnalysisOutcome, LLM_INTAKE_RESULT_NOTE, } from "../agent/intake.js";
import { reviewTaskCompletion } from "../agent/completion-review.js";
import { resolveRunRoute } from "./routing.js";
import { normalizeDirectArtifactDeliverySemantics } from "./execution-profile.js";
import { buildFollowupPrompt, createDefaultScheduleActionDependencies, executeScheduleActions, inferDelegatedTaskProfile, } from "./action-execution.js";
import { emitAssistantTextDelivery, resolveAssistantTextDeliveryOutcome, } from "./delivery.js";
import { CanonicalExecutionFailure, isCanonicalExecutionFailure, } from "./canonical-execution-failure.js";
import { combineUserFacingTextSources, } from "./loop-directive.js";
import { redactLogText } from "../logger/index.js";
import { decideExecutionRoute, } from "../orchestration/decide-execution-route.js";
import { buildExecutionGraphSnapshot, EXECUTION_GRAPH_ROOT_AGENT_ID, } from "../orchestration/execution-graph-snapshot.js";
import { executionHarnessPolicyContextLabel, formatAgentExecutionDecisionTraceRunEvent, runAgentExecutionHarness, } from "../orchestration/execution-harness.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { buildCanonicalIntakeDiagnosisDescriptor, } from "./canonical-intake-diagnosis.js";
import { buildCanonicalSimplePathReleaseDescriptor } from "./canonical-simple-path.js";
import { buildDirectLlmResponseReviewReceipt } from "./user-facing-response-gate.js";
const defaultModuleDependencies = {
    analyzeTaskIntake: analyzeTaskIntakeOutcome,
    emitAssistantTextDelivery,
    resolveRunRoute,
    executeScheduleActions,
    createDefaultScheduleActionDependencies,
    inferDelegatedTaskProfile,
    buildFollowupPrompt,
    decideExecutionRoute,
    buildExecutionGraphSnapshot,
    runAgentExecutionHarness,
    reviewTaskCompletion,
};
function buildExecutionDecisionModelCaller(input) {
    if (!input.config)
        return undefined;
    const providerId = input.providerId?.trim() || detectAvailableProvider(input.config);
    let provider = input.provider;
    if (!provider && providerId) {
        try {
            provider = getProvider(providerId, input.config);
        }
        catch {
            provider = undefined;
        }
    }
    if (!provider)
        return undefined;
    const model = input.model?.trim() || getDefaultModel(input.config) || provider.supportedModels[0];
    if (!model)
        return undefined;
    return async (params) => {
        let output = "";
        for await (const chunk of provider.chat({
            model,
            system: loadPromptTemplate({
                sourceId: "execution_decision_harness",
                workDir: input.workDir,
                variables: {
                    policyBlock: `${executionHarnessPolicyContextLabel("policy_sources_title")}\nstatus: ${executionHarnessPolicyContextLabel("provided_in_user_prompt")}`,
                    allowedActions: executionHarnessPolicyContextLabel("provided_in_user_prompt"),
                    contextJson: executionHarnessPolicyContextLabel("context_json_in_user_prompt"),
                },
            }),
            messages: [{ role: "user", content: params.prompt }],
            maxTokens: 4000,
            signal: params.signal,
        })) {
            if (chunk.type === "text_delta")
                output += chunk.delta;
        }
        return output.trim();
    };
}
function recordExecutionDecisionTraceForRun(dependencies, runId, decisionRoute) {
    dependencies.recordExecutionDecisionTrace?.({
        runId,
        agentExecutionDecision: decisionRoute.agentExecutionDecision,
        executionDecisionTrace: decisionRoute.decisionResult.decisionTrace,
    });
}
function safeReviewErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
async function reviewDelegatedChildCompletion(input) {
    const reviewer = input.moduleDependencies.reviewTaskCompletion;
    if (!reviewer || !input.params.config)
        return null;
    return reviewer({
        instructionRuntime: createInstructionRuntimeContext(dirname(input.params.artifactStorage.rootDir)),
        originalRequest: input.params.originalRequest,
        latestAssistantMessage: input.childSummary,
        ...(input.params.model ? { model: input.params.model } : {}),
        ...(input.params.providerId ? { providerId: input.params.providerId } : {}),
        ...(input.params.provider ? { provider: input.params.provider } : {}),
        config: input.params.config,
        workDir: input.params.workDir,
    }).catch((error) => {
        const message = safeReviewErrorMessage(error);
        input.dependencies.appendRunEvent(input.params.runId, `parent_run_child_result_review_failed:intake_followup;child_run=${input.childRunId};error=${message}`);
        return null;
    });
}
function buildDelegatedChildCompletionFollowupPrompt(params) {
    return loadPromptTemplate({
        sourceId: "delegated_child_followup_user",
        workDir: params.workDir,
        variables: {
            originalRequest: params.originalRequest,
            childSummary: params.childSummary,
            reviewSummary: params.review.summary || "추가 확인이 필요합니다.",
            reviewReason: params.review.reason ? `Review reason:\n${params.review.reason}` : "",
            remainingItems: params.review.remainingItems.length > 0
                ? `Remaining items:\n${params.review.remainingItems.map((item) => `- ${item}`).join("\n")}`
                : "",
            focusedFollowup: params.review.followupPrompt ?? params.review.summary,
        },
    });
}
function buildDelegatedChildReviewDirective(params) {
    if (params.review.status === "ask_user") {
        const explicitUserMessage = params.review.userMessage?.trim();
        const reasonMessage = params.review.reason?.trim();
        const userMessage = explicitUserMessage || reasonMessage || "요청을 완료하려면 추가 확인이 필요합니다.";
        const userMessageSource = explicitUserMessage || reasonMessage ? "mixed" : "runtime_deterministic";
        const reason = reasonMessage && reasonMessage !== userMessage ? reasonMessage : undefined;
        return {
            kind: "awaiting_user",
            preview: "",
            summary: params.review.summary || "하위 실행 결과 검증에서 사용자 확인이 필요합니다.",
            ...(reason ? { reason } : {}),
            userMessage,
            userMessageSource,
            remainingItems: params.review.remainingItems,
            eventLabel: "하위 실행 결과 검증 사용자 확인",
        };
    }
    if (params.review.status === "followup" || params.review.remainingItems.length > 0) {
        const nextMessage = buildDelegatedChildCompletionFollowupPrompt(params);
        return {
            kind: "retry_intake",
            summary: params.review.summary || "하위 실행 결과에 남은 항목이 있어 계속 확인합니다.",
            reason: params.review.reason || "하위 실행 결과가 원 요청을 완전히 충족하지 않았습니다.",
            message: nextMessage,
            recoveryAdmission: {
                previousStrategyFingerprint: fingerprintIntakeStrategy(params.originalRequest),
                nextStrategyFingerprint: fingerprintIntakeStrategy(nextMessage),
                changedDimensions: ["strategy"],
            },
            remainingItems: params.review.remainingItems,
            eventLabel: "하위 실행 결과 미완료로 재분석",
        };
    }
    return null;
}
function fingerprintIntakeStrategy(message) {
    return `sha256:${createHash("sha256").update(message).digest("hex")}`;
}
export function resolveIntakeDirectReceiptCompletion(intake) {
    if (intake.user_message.mode !== "clarification_receipt" &&
        intake.user_message.mode !== "failed_receipt") {
        return null;
    }
    const text = intake.user_message.text.trim();
    if (!text)
        return null;
    const textSource = resolveIntakeUserMessageTextSource(intake.notes);
    if (intake.user_message.mode === "clarification_receipt") {
        return {
            kind: "awaiting_user",
            preview: "",
            summary: "추가 입력이 필요합니다.",
            userMessage: text,
            userMessageSource: textSource,
            eventLabel: textSource === "llm_generated" ? "intake 확인 질문 대기" : "intake 런타임 확인 질문 대기",
        };
    }
    return {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: text,
        userMessageSource: textSource,
        eventLabel: textSource === "llm_generated" ? "intake 실패 응답 종료" : "intake 런타임 실패 응답 종료",
    };
}
function resolveIntakeUserMessageTextSource(notes) {
    return notes.includes(LLM_INTAKE_RESULT_NOTE) ? "llm_generated" : "runtime_deterministic";
}
export async function runIntakeBridgePass(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const intakeSessionId = params.requestGroupId !== params.runId || params.reuseConversationContext
        ? params.sessionId
        : undefined;
    let intake;
    let directResponseProvenance;
    try {
        const analysis = await moduleDependencies.analyzeTaskIntake({
            userMessage: params.message,
            ...(intakeSessionId ? { sessionId: intakeSessionId } : {}),
            requestGroupId: params.requestGroupId,
            ...(params.model ? { model: params.model } : {}),
            config: params.config,
            workDir: params.workDir,
            source: params.source,
            ...(params.signal ? { signal: params.signal } : {}),
            ...(params.firstResponseDeadline
                ? { firstResponseDeadline: params.firstResponseDeadline }
                : {}),
            ...(params.nowMs ? { nowMs: params.nowMs } : {}),
            instructionRuntime: createInstructionRuntimeContext(dirname(params.artifactStorage.rootDir)),
        });
        if (isTaskIntakeAnalysisOutcome(analysis)) {
            if (analysis.status === "failure") {
                throw new CanonicalExecutionFailure({
                    phase: "intake",
                    reasonCode: analysis.reasonCode,
                    retryable: analysis.retryable,
                });
            }
            intake = analysis.intake;
            directResponseProvenance = analysis.directResponseProvenance;
        }
        else {
            intake = analysis;
        }
    }
    catch (failure) {
        if (isCanonicalExecutionFailure(failure))
            throw failure;
        throw new CanonicalExecutionFailure({
            phase: "intake",
            reasonCode: "provider_unavailable",
            retryable: true,
        });
    }
    if (!intake) {
        throw new CanonicalExecutionFailure({
            phase: "intake",
            reasonCode: "intake_contract_unavailable",
            retryable: false,
        });
    }
    const nonReplyActionCount = intake.action_items.filter((item) => item.type !== "reply").length;
    const directAnswerText = intake.user_message.text.trim();
    const isDirectAnswerCompletion = intake.intent.category === "direct_answer" &&
        intake.user_message.mode === "direct_answer" &&
        nonReplyActionCount === 0;
    const textSource = resolveIntakeUserMessageTextSource(intake.notes);
    if (directAnswerText && isDirectAnswerCompletion && textSource === "llm_generated") {
        const releaseDescriptor = buildCanonicalSimplePathReleaseDescriptor({
            runId: params.runId,
            classification: {
                category: intake.intent.category,
                mode: intake.user_message.mode,
                nonReplyActionCount,
            },
            answerSource: textSource,
            requestText: params.originalRequest,
            answerText: directAnswerText,
        });
        const release = await dependencies.releaseCanonicalSimplePath(releaseDescriptor);
        if (!release.ok) {
            throw new CanonicalExecutionFailure({
                phase: "execution",
                reasonCode: release.reasonCode,
                retryable: false,
            });
        }
        dependencies.logInfo("intake bridge result", {
            runId: params.runId,
            sessionId: params.sessionId,
            category: intake.intent.category,
            actions: intake.action_items.map((item) => item.type),
            scheduling: intake.scheduling,
        });
        dependencies.appendRunEvent(params.runId, `Intake: ${intake.intent.category}`);
        if (intake.intent.summary.trim())
            dependencies.updateRunSummary(params.runId, intake.intent.summary.trim());
        return {
            kind: "complete",
            text: directAnswerText,
            textSource,
            ...(directResponseProvenance ? { responseReview: {
                    rawText: directAnswerText,
                    rawTextSource: "llm_generated",
                    contentKind: "direct_answer",
                    expectedLanguage: intake.structured_request.source_language === "ko" ||
                        intake.structured_request.source_language === "en"
                        ? intake.structured_request.source_language
                        : "unknown",
                    receipt: buildDirectLlmResponseReviewReceipt({
                        rawText: directAnswerText,
                        responseText: directAnswerText,
                        ...directResponseProvenance,
                    }),
                } } : {}),
            eventLabel: textSource === "llm_generated" ? "intake 즉시 응답 완료" : "intake 런타임 즉시 응답 완료",
        };
    }
    if (intake.user_message.mode === "accepted_receipt" &&
        directAnswerText &&
        textSource === "llm_generated") {
        const progressReceipt = await moduleDependencies.emitAssistantTextDelivery?.({
            runId: params.runId,
            sessionId: params.sessionId,
            text: directAnswerText,
            textSource,
            source: params.source,
            onChunk: params.onChunk,
            deliveryKind: "progress",
            ...(params.nowMs ? { monotonicNow: params.nowMs } : {}),
            ...(params.signal ? { isCancelled: () => params.signal?.aborted ?? false } : {}),
        });
        const progressOutcome = progressReceipt
            ? resolveAssistantTextDeliveryOutcome(progressReceipt)
            : undefined;
        dependencies.appendRunEvent(params.runId, !progressOutcome
            ? "first_response_progress_delivery_failed:delivery_port_unavailable"
            : progressOutcome.hasDeliveryFailure
                ? `first_response_progress_delivery_failed:${progressOutcome.reasonCode ?? progressOutcome.failureStage}`
                : "first_response_progress_delivered");
        if (progressReceipt?.runId &&
            progressReceipt.receiptRef &&
            progressReceipt.deliveredAtMs !== undefined) {
            params.recordFirstResponseReceipt?.({
                runId: progressReceipt.runId,
                receiptRef: progressReceipt.receiptRef,
                deliveredAtMs: progressReceipt.deliveredAtMs,
            });
        }
    }
    const canonicalDiagnosis = await dependencies.recordCanonicalIntakeDiagnosis(buildCanonicalIntakeDiagnosisDescriptor({ runId: params.runId, intake }));
    if (!canonicalDiagnosis.ok) {
        throw new CanonicalExecutionFailure({
            phase: "intake",
            reasonCode: canonicalDiagnosis.reasonCode,
            retryable: false,
        });
    }
    const canonicalPolicy = await dependencies.authorizeCanonicalIntakePlan({
        runId: params.runId,
        intake,
    });
    if (!canonicalPolicy.ok) {
        throw new CanonicalExecutionFailure({
            phase: "policy",
            reasonCode: canonicalPolicy.reasonCode,
            retryable: false,
        });
    }
    const canonicalExecution = await dependencies.recordCanonicalExecutionStart({
        runId: params.runId,
        intake,
    });
    if (!canonicalExecution.ok) {
        throw new CanonicalExecutionFailure({
            phase: "execution",
            reasonCode: canonicalExecution.reasonCode,
            retryable: false,
        });
    }
    dependencies.logInfo("intake bridge result", {
        runId: params.runId,
        sessionId: params.sessionId,
        category: intake.intent.category,
        actions: intake.action_items.map((item) => item.type),
        scheduling: intake.scheduling,
    });
    dependencies.appendRunEvent(params.runId, `Intake: ${intake.intent.category}`);
    if (intake.intent.summary.trim()) {
        dependencies.updateRunSummary(params.runId, intake.intent.summary.trim());
    }
    const replyAction = intake.action_items.find((item) => item.type === "reply");
    if (replyAction) {
        const content = getString(replyAction.payload.content);
        if (content && intake.notes.includes(LLM_INTAKE_RESULT_NOTE) && nonReplyActionCount > 0) {
            dependencies.appendRunEvent(params.runId, "intake_reply_action_ignored:mixed_actions");
        }
    }
    const scheduleActions = intake.action_items.filter((item) => item.type === "create_schedule" || item.type === "cancel_schedule");
    const delegatedActions = intake.action_items.filter((item) => item.type === "run_task" || item.type === "delegate_agent");
    if (scheduleActions.length > 0 ||
        delegatedActions.length > 0 ||
        intake.intent.category === "schedule_request") {
        const responseParts = [];
        const responsePartTextSources = [];
        const responsePartNotices = [];
        let delegatedFollowupCount = 0;
        if (scheduleActions.length > 0 || intake.intent.category === "schedule_request") {
            if (!params.config) {
                return {
                    kind: "complete",
                    text: "일정 작업을 실행할 런타임 설정 snapshot이 없어 요청을 처리하지 못했습니다.",
                    textSource: "runtime_deterministic",
                    eventLabel: "일정 실행 설정 누락",
                };
            }
            const scheduleResult = moduleDependencies.executeScheduleActions(scheduleActions, intake, params, moduleDependencies.createDefaultScheduleActionDependencies({
                artifactStorage: params.artifactStorage,
                scheduleDelayedRun: dependencies.scheduleDelayedRun,
                config: params.config,
            }));
            dependencies.logInfo("schedule action handled", {
                runId: params.runId,
                sessionId: params.sessionId,
                count: scheduleActions.length,
                ok: scheduleResult.ok,
                message: scheduleResult.message,
            });
            const shouldRetryScheduleIntake = !scheduleResult.ok && scheduleResult.successCount === 0 && delegatedActions.length === 0;
            if (shouldRetryScheduleIntake) {
                return {
                    kind: "stop",
                    preview: "",
                    summary: "일정 요청을 처리하지 못했습니다.",
                    reason: scheduleResult.detail || scheduleResult.message,
                    remainingItems: [
                        "유효한 run_at 또는 cron 일정이 필요합니다.",
                    ],
                    eventLabel: "일정 실행 실패 종료",
                };
            }
            if (scheduleResult.message.trim()) {
                responseParts.push(scheduleResult.message.trim());
                responsePartTextSources.push(scheduleResult.messageTextSource);
                if (scheduleResult.notice)
                    responsePartNotices.push(scheduleResult.notice);
            }
            for (const receipt of scheduleResult.receipts) {
                if (receipt.kind === "schedule_create_one_time") {
                    dependencies.emitScheduleCreated(buildScheduleRegistrationCreatedEvent({
                        runId: params.runId,
                        requestGroupId: params.requestGroupId,
                        registrationKind: "one_time",
                        title: receipt.title,
                        task: receipt.task,
                        source: receipt.source,
                        scheduleText: receipt.scheduleText,
                        runAtMs: receipt.runAtMs,
                    }));
                    continue;
                }
                if (receipt.kind === "schedule_create_recurring") {
                    dependencies.emitScheduleCreated(buildScheduleRegistrationCreatedEvent({
                        runId: receipt.originRunId,
                        requestGroupId: receipt.originRequestGroupId,
                        registrationKind: "recurring",
                        title: receipt.title,
                        task: receipt.task,
                        source: receipt.source,
                        scheduleText: receipt.scheduleText,
                        scheduleId: receipt.scheduleId,
                        cron: receipt.cron,
                        ...(receipt.targetSessionId ? { targetSessionId: receipt.targetSessionId } : {}),
                        driver: receipt.driver,
                    }));
                    continue;
                }
                dependencies.emitScheduleCancelled(buildScheduleRegistrationCancelledEvent({
                    runId: params.runId,
                    requestGroupId: params.requestGroupId,
                    cancelledScheduleIds: receipt.cancelledScheduleIds,
                    cancelledNames: receipt.cancelledNames,
                }));
            }
        }
        for (const delegatedAction of delegatedActions) {
            const delegatedExecutionSemantics = normalizeDirectArtifactDeliverySemantics({
                message: params.originalRequest,
                originalRequest: params.originalRequest,
                executionSemantics: intake.intent_envelope.execution_semantics,
                structuredRequest: intake.structured_request,
                intentEnvelope: intake.intent_envelope,
            });
            const delegatedIntentEnvelope = {
                ...intake.intent_envelope,
                execution_semantics: delegatedExecutionSemantics,
                delivery_mode: delegatedExecutionSemantics.artifactDelivery,
                requires_approval: delegatedExecutionSemantics.approvalRequired,
                approval_tool: delegatedExecutionSemantics.approvalTool,
            };
            const delegatedIntake = {
                ...intake,
                execution: {
                    ...intake.execution,
                    execution_semantics: delegatedExecutionSemantics,
                },
                intent_envelope: delegatedIntentEnvelope,
            };
            const delegatedTaskProfile = moduleDependencies.inferDelegatedTaskProfile({
                intake: delegatedIntake,
                action: delegatedAction,
            });
            const preferredTarget = getString(delegatedAction.payload.preferred_target) ||
                getString(delegatedAction.payload.preferredTarget) ||
                intake.intent_envelope.preferred_target;
            if (!params.config)
                throw new Error("execution graph runtime config is required");
            const callModel = buildExecutionDecisionModelCaller({
                providerId: params.providerId,
                provider: params.provider,
                model: params.model,
                config: params.config,
                workDir: params.workDir,
            });
            const decisionRoute = await (moduleDependencies.decideExecutionRoute ?? decideExecutionRoute)({
                originalRequest: params.originalRequest,
                delegatedTitle: delegatedAction.title,
                delegatedTaskProfile,
                sessionId: params.sessionId,
                source: params.source,
                preferredTarget,
                fallbackModel: params.model,
                currentExecutorId: EXECUTION_GRAPH_ROOT_AGENT_ID,
                config: params.config,
                ...(params.executionTools ? { availableTools: params.executionTools } : {}),
                buildExecutionGraphSnapshot: moduleDependencies.buildExecutionGraphSnapshot,
                runAgentExecutionHarness: moduleDependencies.runAgentExecutionHarness,
                ...(callModel ? { callModel } : {}),
                resolveExplicitProviderTarget: (routeInput) => moduleDependencies.resolveRunRoute({
                    preferredTarget: routeInput.preferredTarget,
                    taskProfile: routeInput.taskProfile,
                    fallbackModel: routeInput.fallbackModel,
                }, params.config),
            });
            if (decisionRoute.kind === "self_solve") {
                recordExecutionDecisionTraceForRun(dependencies, params.runId, decisionRoute);
                dependencies.appendRunEvent(params.runId, formatAgentExecutionDecisionTraceRunEvent(decisionRoute.decisionResult.decisionTrace));
                dependencies.appendRunEvent(params.runId, "execution_decision_fallback:self_solve; provider_direct_blocked_without_explicit_target");
                dependencies.logInfo("delegated follow-up self-solve fallback", {
                    runId: params.runId,
                    sessionId: params.sessionId,
                    delegatedType: delegatedAction.type,
                    delegatedTitle: delegatedAction.title,
                    delegatedTaskProfile,
                    preferredTarget: preferredTarget ?? null,
                    reason: "provider_direct_blocked_without_explicit_target",
                });
                return {
                    kind: "execute",
                    message: moduleDependencies.buildFollowupPrompt({
                        originalMessage: params.originalRequest,
                        intake: delegatedIntake,
                        action: delegatedAction,
                        taskProfile: delegatedTaskProfile,
                    }),
                    requiredToolNames: canonicalPolicy.requiredToolNames ?? [],
                    eventLabel: "LLM intake 실행 계약 적용",
                };
            }
            if (decisionRoute.kind === "boundary_failure") {
                recordExecutionDecisionTraceForRun(dependencies, params.runId, decisionRoute);
                dependencies.appendRunEvent(params.runId, formatAgentExecutionDecisionTraceRunEvent(decisionRoute.decisionResult.decisionTrace));
                return {
                    kind: "execute",
                    message: moduleDependencies.buildFollowupPrompt({
                        originalMessage: params.originalRequest,
                        intake: delegatedIntake,
                        action: delegatedAction,
                        taskProfile: delegatedTaskProfile,
                        selectedExecutorReason: decisionRoute.agentExecutionDecision.unresolved_reason?.trim()
                            || decisionRoute.agentExecutionDecision.reason.trim(),
                    }),
                    requiredToolNames: [],
                    eventLabel: "execution decision 경계 결과 재진단",
                };
            }
            if (decisionRoute.kind === "ask_user") {
                const explicitUserMessage = decisionRoute.agentExecutionDecision.unresolved_reason?.trim();
                const reasonMessage = decisionRoute.agentExecutionDecision.reason?.trim();
                const userMessage = explicitUserMessage ?? "요청을 계속 진행하려면 필요한 조건을 확인해 주세요.";
                const userMessageSource = explicitUserMessage || reasonMessage ? "mixed" : "runtime_deterministic";
                recordExecutionDecisionTraceForRun(dependencies, params.runId, decisionRoute);
                dependencies.appendRunEvent(params.runId, formatAgentExecutionDecisionTraceRunEvent(decisionRoute.decisionResult.decisionTrace));
                return {
                    kind: "awaiting_user",
                    preview: "",
                    summary: "실행 전에 사용자 확인이 필요합니다.",
                    ...(reasonMessage ? { reason: reasonMessage } : {}),
                    userMessage,
                    userMessageSource,
                    eventLabel: "execution decision 사용자 확인 대기",
                };
            }
            const route = decisionRoute.kind === "explicit_provider_target" ||
                decisionRoute.kind === "delegate_to_child"
                ? decisionRoute.route
                : undefined;
            if (!route)
                continue;
            const routeWorkerRuntime = route.workerRuntime;
            const followupPrompt = moduleDependencies.buildFollowupPrompt({
                originalMessage: params.originalRequest,
                intake: delegatedIntake,
                action: delegatedAction,
                taskProfile: delegatedTaskProfile,
                ...(route.targetId ? { selectedExecutorId: route.targetId } : {}),
                ...(route.targetLabel ? { selectedExecutorLabel: route.targetLabel } : {}),
                ...(decisionRoute.kind === "delegate_to_child"
                    ? { selectedExecutorReason: decisionRoute.agentExecutionDecision.reason }
                    : {}),
            });
            if (decisionRoute.kind === "delegate_to_child") {
                recordExecutionDecisionTraceForRun(dependencies, params.runId, decisionRoute);
                dependencies.appendRunEvent(params.runId, formatAgentExecutionDecisionTraceRunEvent(decisionRoute.decisionResult.decisionTrace));
            }
            if (decisionRoute.kind === "explicit_provider_target") {
                dependencies.appendRunEvent(params.runId, `execution_decision_fallback:explicit_provider; provider_direct_allowed_with_explicit_target; target=${route.targetId ?? preferredTarget ?? "unknown"}`);
            }
            dependencies.appendRunEvent(params.runId, route.targetLabel
                ? `후속 실행 생성: ${delegatedAction.title} -> ${route.targetLabel} (${delegatedTaskProfile})`
                : `후속 실행 생성: ${delegatedAction.title} (${delegatedTaskProfile})`);
            dependencies.logInfo("delegated follow-up run created", {
                runId: params.runId,
                sessionId: params.sessionId,
                delegatedType: delegatedAction.type,
                delegatedTitle: delegatedAction.title,
                delegatedTaskProfile,
                targetId: route.targetId ?? null,
                targetLabel: route.targetLabel ?? null,
                model: route.model ?? params.model ?? null,
                providerId: route.providerId ?? null,
                workerRuntime: routeWorkerRuntime?.kind ?? null,
                executionGraph: decisionRoute.kind === "delegate_to_child"
                    ? {
                        graphId: decisionRoute.executionGraph.graphId,
                        graphSource: decisionRoute.executionGraph.graphSource,
                        topologyId: decisionRoute.executionGraph.topologyId ?? null,
                        currentExecutorId: decisionRoute.executionGraph.currentExecutorId,
                        availableExecutorIds: decisionRoute.executionGraph.availableExecutorIds,
                    }
                    : null,
                executionDecisionSource: decisionRoute.kind === "delegate_to_child" ? "knowbee_harness" : null,
            });
            dependencies.incrementDelegationTurnCount(params.runId, `${delegatedAction.title} 후속 작업을 시작합니다.`);
            const delegatedRequestGroupId = `${params.runId}:child:${delegatedFollowupCount + 1}`;
            const delegatedRun = await dependencies.startDelegatedRun({
                message: followupPrompt,
                sessionId: params.sessionId,
                taskProfile: dependencies.normalizeTaskProfile(delegatedTaskProfile),
                requestGroupId: delegatedRequestGroupId,
                parentRunId: params.runId,
                runScope: "child",
                handoffSummary: delegatedAction.title,
                originalRequest: params.message,
                executionSemantics: delegatedExecutionSemantics,
                structuredRequest: delegatedIntake.structured_request,
                intentEnvelope: delegatedIntentEnvelope,
                model: route.model ?? params.model,
                ...(route.providerId ? { providerId: route.providerId } : {}),
                ...(route.provider ? { provider: route.provider } : {}),
                ...(route.providerTrace ? { providerTrace: route.providerTrace } : {}),
                ...(routeWorkerRuntime ? { workerRuntime: routeWorkerRuntime } : {}),
                ...(route.targetId ? { targetId: route.targetId } : {}),
                ...(route.targetLabel ? { targetLabel: route.targetLabel } : {}),
                ...(decisionRoute.kind === "delegate_to_child"
                    ? { agentExecutionDecision: decisionRoute.agentExecutionDecision }
                    : {}),
                ...(decisionRoute.kind === "delegate_to_child"
                    ? { agentExecutionDecisionTrace: decisionRoute.decisionResult.decisionTrace }
                    : {}),
                workDir: params.workDir,
                source: params.source,
                skipIntake: true,
                contextMode: "handoff",
            });
            delegatedFollowupCount += 1;
            if (isDelegatedRunStartResult(delegatedRun) && delegatedRun.finished) {
                dependencies.appendRunEvent(params.runId, `parent_run_awaiting_child_result:intake_followup;child_run=${delegatedRun.runId ?? "unknown"}`);
                const completedChild = await delegatedRun.finished;
                dependencies.appendRunEvent(params.runId, `parent_run_child_result_received:intake_followup;child_run=${delegatedRun.runId ?? "unknown"};status=${completedChild?.status ?? "unknown"}`);
                const childSummary = completedChild?.summary?.trim();
                if (childSummary) {
                    const childRunId = delegatedRun.runId ?? "unknown";
                    const completionReview = await reviewDelegatedChildCompletion({
                        params,
                        dependencies,
                        moduleDependencies,
                        childRunId,
                        childSummary,
                    });
                    if (completionReview) {
                        dependencies.appendRunEvent(params.runId, `parent_run_child_result_review:intake_followup;child_run=${childRunId};status=${completionReview.status};remaining=${completionReview.remainingItems.length}`);
                        const reviewDirective = buildDelegatedChildReviewDirective({
                            originalRequest: params.originalRequest,
                            childSummary,
                            review: completionReview,
                            workDir: params.workDir,
                        });
                        if (reviewDirective)
                            return reviewDirective;
                    }
                    responseParts.push(childSummary);
                    responsePartTextSources.push(completionReview ? "llm_reviewed" : "llm_generated");
                }
            }
        }
        if (responseParts.length > 0) {
            return {
                kind: "complete",
                text: responseParts.join("\n\n"),
                textSource: combineUserFacingTextSources(responsePartTextSources),
                ...(responsePartNotices.length === 1 ? { notice: responsePartNotices[0] } : {}),
                eventLabel: "intake 처리 결과 전달",
            };
        }
        if (delegatedFollowupCount > 0) {
            return {
                kind: "complete_silent",
                summary: "후속 실행으로 전달되었습니다.",
                eventLabel: "intake 후속 실행 생성 완료",
            };
        }
        return null;
    }
    const directReceiptCompletion = resolveIntakeDirectReceiptCompletion(intake);
    if (directReceiptCompletion)
        return directReceiptCompletion;
    return null;
}
function getString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function isDelegatedRunStartResult(value) {
    return typeof value === "object" && value !== null && ("finished" in value || "runId" in value);
}
//# sourceMappingURL=intake-bridge-pass.js.map