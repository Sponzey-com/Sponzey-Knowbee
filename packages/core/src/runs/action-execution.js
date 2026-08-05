import crypto from "node:crypto";
import { dirname, join } from "node:path";
import { getSchedule, insertAuditLog, insertSchedule, updateSchedule, upsertScheduleMemoryEntry } from "../db/index.js";
import { CONTRACT_SCHEMA_VERSION, } from "../contracts/index.js";
import { findScheduleCandidatesByContract } from "../schedules/candidates.js";
import { storeMemorySync } from "../memory/store.js";
import { isValidCron, isValidTimeZone, normalizeScheduleTimezone } from "../scheduler/cron.js";
import { buildPromptContextBlockPlan } from "../orchestration/prompt-bundle.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { reconcileScheduleExecution, removeManagedScheduleExecution, } from "../scheduler/system-cron.js";
import { buildScheduledFollowupPrompt, getScheduledRunExecutionOptions } from "./scheduled.js";
import { buildScheduleActionResultNotice, } from "./schedule-action-notice.js";
const TASK_EXECUTION_BRIEF_SECTION_LABELS_SOURCE_ID = "task_execution_brief_section_labels_user";
function taskExecutionBriefSectionLabel(key, variables = {}) {
    const entries = loadPromptValue(TASK_EXECUTION_BRIEF_SECTION_LABELS_SOURCE_ID, variables, { required: true })
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
        throw new Error(`task execution brief section label missing: ${key}`);
    return value;
}
function defaultScheduleActionReceipts() {
    return [];
}
function withScheduleActionResultProvenance(result, actionCount = result.successCount + result.failureCount) {
    return {
        ...result,
        messageTextSource: "runtime_deterministic",
        requiresFinalResponseRendering: true,
        notice: buildScheduleActionResultNotice({
            ok: result.ok,
            actionCount,
            successCount: result.successCount,
            failureCount: result.failureCount,
        }),
    };
}
function describeDefaultScheduleDestination(source) {
    return source === "telegram" || source === "slack" ? `${source} current session` : `${source} current session`;
}
function buildRecurringScheduleContract(params) {
    const targetChannel = params.source === "telegram"
        ? "telegram"
        : params.source === "slack"
            ? "slack"
            : "agent";
    const literalText = params.literalText?.trim();
    return {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        kind: "recurring",
        responseLanguageMode: params.responseLanguageMode,
        time: {
            cron: params.cron,
            timezone: params.timezone,
            missedPolicy: "next_only",
        },
        payload: literalText
            ? {
                kind: "literal_message",
                literalText,
            }
            : {
                kind: "agent_task",
                taskContract: null,
            },
        delivery: {
            schemaVersion: CONTRACT_SCHEMA_VERSION,
            mode: "channel_message",
            channel: targetChannel,
            sessionId: params.targetSessionId ?? null,
            threadId: null,
        },
        source: {
            originRunId: params.originRunId,
            originRequestGroupId: params.originRequestGroupId,
        },
        displayName: params.title,
        rawText: params.task,
    };
}
export function createDefaultScheduleActionDependencies(overrides) {
    const stateDir = dirname(overrides.artifactStorage.rootDir);
    const systemCronPaths = Object.freeze({ stateDir, logsDir: join(stateDir, "logs") });
    return {
        scheduleDelayedRun: overrides.scheduleDelayedRun,
        createRecurringSchedule: (params) => {
            const now = Date.now();
            const scheduleId = crypto.randomUUID();
            const targetSessionId = params.source === "telegram" || params.source === "slack" ? params.sessionId : undefined;
            const timezone = normalizeScheduleTimezone(params.timezone, overrides.config.scheduler.timezone || overrides.config.profile.timezone);
            const contract = buildRecurringScheduleContract({
                title: params.title,
                task: params.task,
                cron: params.cron,
                timezone,
                source: params.source,
                ...(targetSessionId ? { targetSessionId } : {}),
                originRunId: params.originRunId,
                originRequestGroupId: params.originRequestGroupId,
                responseLanguageMode: params.responseLanguageMode,
                ...(params.literalText ? { literalText: params.literalText } : {}),
            });
            const [duplicateCandidate] = findScheduleCandidatesByContract({
                contract,
                ...(targetSessionId ? { sessionId: targetSessionId } : {}),
                limit: 1,
            }).filter((candidate) => candidate.candidateReason === "identity_key" && !candidate.requiresComparison);
            if (duplicateCandidate) {
                insertAuditLog({
                    timestamp: now,
                    session_id: targetSessionId ?? null,
                    run_id: params.originRunId,
                    request_group_id: params.originRequestGroupId,
                    channel: params.source,
                    source: "scheduler",
                    tool_name: "schedule_duplicate_decision",
                    params: JSON.stringify({
                        incomingIdentityKey: duplicateCandidate.matchedKeys[0] ?? null,
                        duplicateScheduleId: duplicateCandidate.schedule.id,
                        decisionSource: "contract_key",
                    }),
                    output: null,
                    result: "success",
                    duration_ms: 0,
                    approval_required: 0,
                    approved_by: null,
                });
                return {
                    scheduleId: duplicateCandidate.schedule.id,
                    ...(targetSessionId ? { targetSessionId } : {}),
                    driver: "internal",
                    reason: "duplicate_contract_key",
                    duplicate: {
                        scheduleId: duplicateCandidate.schedule.id,
                        title: duplicateCandidate.schedule.name,
                        decisionSource: "contract_key",
                    },
                };
            }
            insertSchedule({
                id: scheduleId,
                name: params.title,
                cron_expression: params.cron,
                timezone,
                prompt: params.task,
                enabled: 1,
                target_channel: params.source === "telegram" ? "telegram" : params.source === "slack" ? "slack" : "agent",
                target_session_id: targetSessionId ?? null,
                execution_driver: "internal",
                origin_run_id: params.originRunId,
                origin_request_group_id: params.originRequestGroupId,
                model: params.model ?? null,
                max_retries: 3,
                timeout_sec: 300,
                contract,
                created_at: now,
                updated_at: now,
            });
            upsertScheduleMemoryEntry({
                scheduleId,
                prompt: params.task,
                ...(targetSessionId ? { sessionId: targetSessionId } : {}),
                requestGroupId: params.originRequestGroupId,
                title: params.title,
                cronExpression: params.cron,
                enabled: true,
                metadata: {
                    source: params.source,
                    timezone,
                    originRunId: params.originRunId,
                    originRequestGroupId: params.originRequestGroupId,
                    targetChannel: params.source === "telegram" ? "telegram" : params.source === "slack" ? "slack" : "agent",
                },
            });
            storeMemorySync({
                content: [
                    `예약 이름: ${params.title}`,
                    `예약 주기: ${params.cron}`,
                    `예약 시간대: ${timezone}`,
                    `실행 내용: ${params.task}`,
                    `전달 채널: ${params.source}`,
                ].join("\n"),
                scope: "schedule",
                scheduleId,
                requestGroupId: scheduleId,
                type: "project_note",
                importance: "medium",
            });
            const execution = reconcileScheduleExecution(scheduleId, systemCronPaths);
            return {
                scheduleId,
                ...(targetSessionId ? { targetSessionId } : {}),
                ...execution,
            };
        },
        cancelSchedules: (scheduleIds) => {
            const cancelledNames = [];
            for (const scheduleId of scheduleIds) {
                const schedule = getSchedule(scheduleId);
                if (!schedule)
                    continue;
                updateSchedule(scheduleId, { enabled: 0 });
                upsertScheduleMemoryEntry({
                    scheduleId,
                    prompt: schedule.prompt,
                    ...(schedule.target_session_id ? { sessionId: schedule.target_session_id } : {}),
                    ...(schedule.origin_request_group_id ? { requestGroupId: schedule.origin_request_group_id } : {}),
                    title: schedule.name,
                    cronExpression: schedule.cron_expression,
                    enabled: false,
                    metadata: {
                        cancelledAt: Date.now(),
                        ...(schedule.timezone ? { timezone: schedule.timezone } : {}),
                    },
                });
                removeManagedScheduleExecution(scheduleId, systemCronPaths);
                cancelledNames.push(schedule.name);
            }
            return cancelledNames;
        },
    };
}
export function inferDelegatedTaskProfile(params) {
    const payload = params.action.payload;
    const explicit = getString(payload.task_profile) || getString(payload.taskProfile);
    if (explicit)
        return explicit;
    return normalizeTaskProfile(params.intake.intent.category === "schedule_request" ? "operations" : "general_chat");
}
export function buildFollowupPrompt(params) {
    const payload = params.action.payload;
    const goal = getString(payload.goal) || params.action.title;
    const context = getString(payload.context) || params.intake.intent.summary || params.originalMessage;
    const successCriteria = toStringList(payload.success_criteria);
    const constraints = toStringList(payload.constraints);
    const requiresFilesystemMutation = params.intake.intent_envelope.execution_semantics.filesystemEffect === "mutate";
    const requiredOutputs = uniqueStrings([
        ...successCriteria,
        ...params.intake.structured_request.complete_condition,
        params.intake.structured_request.target,
    ]);
    const verificationNotes = uniqueStrings([
        ...constraints,
        ...params.intake.notes,
        params.intake.intent_envelope.execution_semantics.approvalRequired
            ? `승인/권한 필요 여부 확인: ${params.intake.intent_envelope.execution_semantics.approvalTool ?? "approval"}`
            : "",
        buildTaskExecutionDefaultVerificationNote(requiresFilesystemMutation),
    ]);
    const promptContextPlan = buildPromptContextBlockPlan({
        mode: "handoff",
        hasLatestUserMessage: true,
        hasChannelMetadata: true,
        hasExecutionGraph: true,
        hasParentWorkOrder: true,
        hasRequiredOutputs: requiredOutputs.length > 0,
        hasVerificationNotes: verificationNotes.length > 0,
        hasReturnToParentContract: true,
    });
    const selectedExecutorLines = params.selectedExecutorId
        ? [
            taskExecutionBriefSectionLabel("validated_executor_header"),
            `${taskExecutionBriefSectionLabel("executor_id_label")} ${params.selectedExecutorId}`,
            params.selectedExecutorLabel ? `${taskExecutionBriefSectionLabel("executor_label_label")} ${params.selectedExecutorLabel}` : "",
            params.selectedExecutorReason ? `${taskExecutionBriefSectionLabel("selection_reason_label")} ${params.selectedExecutorReason}` : "",
        ].filter(Boolean).join("\n")
        : "";
    const structuredRequest = {
        ...params.intake.structured_request,
        target: params.intake.intent_envelope.target.trim() || goal,
        to: params.intake.intent_envelope.destination.trim() || params.intake.structured_request.to,
        context: params.intake.intent_envelope.context.length > 0
            ? params.intake.intent_envelope.context
            : [context],
        normalized_english: params.intake.intent_envelope.normalized_english.trim()
            || params.intake.structured_request.normalized_english.trim(),
        complete_condition: params.intake.intent_envelope.complete_condition.length > 0
            ? params.intake.intent_envelope.complete_condition
            : params.intake.structured_request.complete_condition,
    };
    return loadPromptTemplate({
        sourceId: "task_execution_brief_user",
        variables: {
            originalRequest: params.originalMessage,
            target: structuredRequest.target || loadPromptValue("execution_default_target_user"),
            destination: structuredRequest.to || loadPromptValue("execution_default_destination_user"),
            contextBlock: formatExecutionBriefListBlock(taskExecutionBriefSectionLabel("context_header"), structuredRequest.context),
            normalizedEnglishBlock: structuredRequest.normalized_english.trim()
                ? `${taskExecutionBriefSectionLabel("normalized_english_header")}\n${structuredRequest.normalized_english.trim()}`
                : "",
            completeConditions: formatExecutionBriefBullets(structuredRequest.complete_condition.length > 0
                ? structuredRequest.complete_condition
                : [loadPromptValue("execution_default_complete_condition_user")]),
            checklist: formatExecutionBriefBullets(buildExecutionBriefChecklist({
                target: structuredRequest.target || loadPromptValue("execution_default_target_user"),
                destination: structuredRequest.to || loadPromptValue("execution_default_destination_user"),
                completeConditions: structuredRequest.complete_condition,
                requiresFilesystemMutation,
                directArtifactDelivery: params.intake.intent_envelope.execution_semantics.artifactDelivery === "direct",
            })),
            includedContextBlocks: [
                taskExecutionBriefSectionLabel("included_context_blocks_header"),
                ...promptContextPlan.includedContextBlocks.map((block) => `- ${block.blockId}: ${block.included ? "included" : "excluded"} (${block.reason})`),
            ].join("\n"),
            parentWorkOrder: [
                taskExecutionBriefSectionLabel("parent_work_order_header"),
                `${taskExecutionBriefSectionLabel("root_request_label")} ${params.originalMessage}`,
                `${taskExecutionBriefSectionLabel("delegated_action_label")} ${params.action.title}`,
                `${taskExecutionBriefSectionLabel("goal_label")} ${goal}`,
                `${taskExecutionBriefSectionLabel("context_label")} ${context}`,
                `${taskExecutionBriefSectionLabel("task_profile_label")} ${params.taskProfile}`,
            ].join("\n"),
            selectedExecutor: selectedExecutorLines,
            requiredOutputs: formatExecutionBriefBullets(requiredOutputs.length > 0
                ? requiredOutputs
                : [loadPromptValue("task_execution_default_required_output_user")]),
            verificationNotes: formatExecutionBriefBullets(verificationNotes.length > 0
                ? verificationNotes
                : [loadPromptValue("task_execution_default_verification_note_user")]),
            taskProfile: params.taskProfile,
            successCriteria: successCriteria.length > 0
                ? [taskExecutionBriefSectionLabel("success_criteria_header"), ...successCriteria.map((item) => `- ${item}`)].join("\n")
                : "",
            constraints: constraints.length > 0
                ? [taskExecutionBriefSectionLabel("constraints_header"), ...constraints.map((item) => `- ${item}`)].join("\n")
                : "",
            executionInstruction: buildTaskExecutionInstruction(requiresFilesystemMutation),
        },
    });
}
function buildTaskExecutionInstruction(requiresFilesystemMutation) {
    return loadPromptTemplate({
        sourceId: requiresFilesystemMutation
            ? "task_execution_filesystem_instruction_user"
            : "task_execution_general_instruction_user",
    }).trim();
}
function buildTaskExecutionDefaultVerificationNote(requiresFilesystemMutation) {
    return loadPromptValue(requiresFilesystemMutation
        ? "task_execution_filesystem_verification_note_user"
        : "task_execution_text_verification_note_user", {}, { required: true });
}
function formatExecutionBriefBullets(items) {
    const normalized = uniqueStrings(items);
    return normalized.length > 0 ? normalized.map((item) => `- ${item}`).join("\n") : "";
}
function formatExecutionBriefListBlock(title, items) {
    const lines = formatExecutionBriefBullets(items);
    return lines ? [title, lines].join("\n") : "";
}
function buildExecutionBriefChecklist(params) {
    return [
        loadPromptValue("task_execution_checklist_confirm_goal_user", { target: params.target }),
        params.requiresFilesystemMutation
            ? loadPromptValue("task_execution_checklist_filesystem_work_user")
            : loadPromptValue("task_execution_checklist_general_work_user"),
        ...(params.completeConditions.length > 0
            ? params.completeConditions.map((condition) => loadPromptValue("task_execution_checklist_complete_condition_user", { completeCondition: condition }))
            : [
                loadPromptValue("task_execution_checklist_complete_condition_user", {
                    completeCondition: loadPromptValue("execution_default_complete_condition_user"),
                }),
            ]),
        params.directArtifactDelivery
            ? loadPromptValue("task_execution_checklist_direct_artifact_user", { destination: params.destination })
            : loadPromptValue("task_execution_checklist_final_result_user", { destination: params.destination }),
        loadPromptValue("task_execution_checklist_stop_condition_user"),
    ];
}
export function executeScheduleActions(actions, intake, params, dependencies) {
    if (actions.length === 0) {
        const receipt = intake.user_message.text.trim();
        return withScheduleActionResultProvenance({
            ok: false,
            message: receipt || "일정 요청을 해석했지만 생성할 스케줄 정보가 부족합니다.",
            detail: "일정 생성 항목이 없습니다.",
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        }, 0);
    }
    if (actions.length === 1) {
        return withScheduleActionResultProvenance(executeScheduleAction(actions[0], intake, params, intake.user_message.text.trim(), dependencies), 1);
    }
    const results = actions.map((action) => executeScheduleAction(action, intake, params, "", dependencies));
    const receipt = intake.user_message.text.trim() || "여러 예약 작업을 접수했습니다.";
    const hasCreate = actions.some((action) => action.type === "create_schedule");
    const heading = results.every((result) => result.ok)
        ? hasCreate ? "일정 요청을 처리했습니다." : "예약 변경을 처리했습니다."
        : hasCreate ? "일부 일정 생성에 실패했습니다." : "일부 예약 변경에 실패했습니다.";
    return withScheduleActionResultProvenance({
        ok: results.every((result) => result.ok),
        message: [receipt, "", heading, ...results.map((result) => `- ${result.detail}`)].join("\n"),
        detail: results.map((result) => result.detail).join(" / "),
        successCount: results.filter((result) => result.ok).length,
        failureCount: results.filter((result) => !result.ok).length,
        receipts: results.flatMap((result) => result.receipts),
    }, actions.length);
}
function executeScheduleAction(action, intake, params, receipt, dependencies) {
    // knowbee-critical-decision-audit: action-execution.structured_schedule_action
    // This dispatch uses structured intake action types, not raw user-language string comparison.
    if (!action || action.type === "create_schedule") {
        return executeCreateScheduleAction(action, intake, params, receipt, dependencies);
    }
    if (action.type === "cancel_schedule") {
        return executeCancelScheduleAction(action, intake, receipt, dependencies);
    }
    return {
        ok: false,
        message: receipt || "현재 이 일정 요청 유형은 아직 처리할 수 없습니다.",
        detail: action.title,
        successCount: 0,
        failureCount: 1,
        receipts: defaultScheduleActionReceipts(),
    };
}
function executeCreateScheduleAction(action, intake, params, receipt, dependencies) {
    if (!action) {
        return {
            ok: false,
            message: receipt || "일정 요청을 해석했지만 생성할 스케줄 정보가 부족합니다.",
            detail: "일정 생성 정보가 부족합니다.",
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        };
    }
    const title = getString(action.payload.title) || "Scheduled Task";
    const task = getString(action.payload.task) || intake.intent.summary || title;
    const cron = getString(action.payload.cron) || intake.scheduling.cron;
    const runAt = getString(action.payload.run_at) || intake.scheduling.run_at;
    const actionScheduleText = getString(action.payload.schedule_text);
    const timezone = getString(action.payload.timezone);
    const followup = getFollowupRunPayload(action);
    if (runAt) {
        const scheduledAt = Date.parse(runAt);
        if (Number.isNaN(scheduledAt)) {
            return {
                ok: false,
                message: receipt
                    ? `${receipt}\n\n일정 생성 실패: run_at 형식이 올바르지 않습니다.`
                    : "일정 생성 실패: run_at 형식이 올바르지 않습니다.",
                detail: `${actionScheduleText ?? title}: run_at 형식이 올바르지 않습니다.`,
                successCount: 0,
                failureCount: 1,
                receipts: defaultScheduleActionReceipts(),
            };
        }
        const immediateCompletionText = followup.literalText;
        const scheduledTaskProfile = normalizeTaskProfile(followup.taskProfile ?? "general_chat");
        const executionOptions = getScheduledRunExecutionOptions(task, scheduledTaskProfile, intake.intent_envelope.execution_semantics);
        dependencies.scheduleDelayedRun({
            runAtMs: scheduledAt,
            message: buildScheduledFollowupPrompt({
                task,
                goal: followup.goal ?? task,
                taskProfile: scheduledTaskProfile,
                preferredTarget: followup.preferredTarget ?? intake.intent_envelope.preferred_target,
                toolsEnabled: executionOptions.toolsEnabled,
                destination: followup.destination ?? intake.intent_envelope.destination,
            }),
            sessionId: params.sessionId,
            originRunId: params.runId,
            originRequestGroupId: params.requestGroupId,
            model: params.model,
            originalRequest: params.originalRequest,
            executionSemantics: intake.intent_envelope.execution_semantics,
            structuredRequest: intake.structured_request,
            intentEnvelope: intake.intent_envelope,
            source: params.source,
            onChunk: params.onChunk,
            ...(immediateCompletionText ? { immediateCompletionText } : {}),
            toolsEnabled: executionOptions.toolsEnabled,
            contextMode: executionOptions.contextMode,
            ...(params.workDir ? { workDir: params.workDir } : {}),
            ...(followup.preferredTarget ? { preferredTarget: followup.preferredTarget } : {}),
            taskProfile: scheduledTaskProfile,
        });
        const scheduleText = actionScheduleText || new Date(scheduledAt).toLocaleString("ko-KR");
        const destination = followup.destination ?? intake.intent_envelope.destination ?? describeDefaultScheduleDestination(params.source);
        return {
            ok: true,
            message: receipt
                ? `${receipt}\n\n일회성 예약 실행이 저장되었습니다.\n- 이름: ${title}\n- 실행 시각: ${scheduleText}`
                : `일회성 예약 실행이 저장되었습니다.\n- 이름: ${title}\n- 실행 시각: ${scheduleText}`,
            detail: `${scheduleText}: ${task}`,
            successCount: 1,
            failureCount: 0,
            receipts: [{
                    kind: "schedule_create_one_time",
                    title,
                    task,
                    runAtMs: scheduledAt,
                    scheduleText,
                    source: params.source,
                    destination,
                    taskProfile: scheduledTaskProfile,
                    directDelivery: Boolean(immediateCompletionText),
                    preferredTarget: followup.preferredTarget ?? intake.intent_envelope.preferred_target,
                    ...(immediateCompletionText ? { immediateCompletionText } : {}),
                }],
        };
    }
    if (!cron || !isValidCron(cron)) {
        const reason = intake.scheduling.failure_reason
            ?? "현재 실행 브리지에서는 유효한 cron 일정이 필요합니다.";
        return {
            ok: false,
            message: receipt
                ? `${receipt}\n\n일정 생성 실패: ${reason}`
                : `일정 생성 실패: ${reason}`,
            detail: `${actionScheduleText ?? title}: ${reason}`,
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        };
    }
    if (timezone && !isValidTimeZone(timezone)) {
        return {
            ok: false,
            message: receipt
                ? `${receipt}\n\n일정 생성 실패: timezone 형식이 올바르지 않습니다.`
                : "일정 생성 실패: timezone 형식이 올바르지 않습니다.",
            detail: `${actionScheduleText ?? title}: timezone 형식이 올바르지 않습니다.`,
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        };
    }
    const executionSync = dependencies.createRecurringSchedule({
        title,
        task,
        cron,
        ...(timezone ? { timezone } : {}),
        source: params.source,
        sessionId: params.sessionId,
        originRunId: params.runId,
        originRequestGroupId: params.requestGroupId,
        model: params.model,
        responseLanguageMode: intake.structured_request.response_language_mode ?? "same_as_request",
        ...(followup.literalText ? { literalText: followup.literalText } : {}),
    });
    const scheduleText = actionScheduleText || cron;
    if (executionSync.duplicate) {
        const message = [
            receipt ? `${receipt}\n` : "",
            "같은 구조의 예약이 이미 있습니다.",
            `- 기존 예약: ${executionSync.duplicate.title}`,
            `- 예약 ID: ${executionSync.duplicate.scheduleId}`,
            "원하는 처리를 선택해 주세요: 기존 예약 유지, 기존 예약 수정, 또는 새 예약으로 추가",
        ].filter(Boolean).join("\n");
        return {
            ok: true,
            message,
            detail: `duplicate schedule candidate ${executionSync.duplicate.scheduleId} by ${executionSync.duplicate.decisionSource}`,
            successCount: 0,
            failureCount: 0,
            receipts: [],
        };
    }
    const driverLabel = executionSync.reason
        ? `내부 scheduler (${executionSync.reason})`
        : executionSync.driver === "internal"
            ? "내부 scheduler"
            : "시스템 스케줄러";
    return {
        ok: true,
        message: receipt
            ? `${receipt}\n\n스케줄이 저장되었습니다.\n- 이름: ${title}\n- 일정: ${scheduleText}\n- 실행 방식: ${driverLabel}`
            : `스케줄이 저장되었습니다.\n- 이름: ${title}\n- 일정: ${scheduleText}\n- 실행 방식: ${driverLabel}`,
        detail: `${scheduleText}: ${task}`,
        successCount: 1,
        failureCount: 0,
        receipts: [{
                kind: "schedule_create_recurring",
                scheduleId: executionSync.scheduleId,
                title,
                task,
                cron,
                scheduleText,
                ...(timezone ? { timezone } : {}),
                source: params.source,
                ...(executionSync.targetSessionId ? { targetSessionId: executionSync.targetSessionId } : {}),
                originRunId: params.runId,
                originRequestGroupId: params.requestGroupId,
                driver: executionSync.driver,
                ...(executionSync.reason ? { driverReason: executionSync.reason } : {}),
            }],
    };
}
function executeCancelScheduleAction(action, intake, receipt, dependencies) {
    const scheduleIds = Array.isArray(action.payload.schedule_ids)
        ? action.payload.schedule_ids.filter((value) => typeof value === "string" && value.trim().length > 0)
        : [];
    if (scheduleIds.length === 0) {
        return {
            ok: false,
            message: receipt || "취소할 예약 알림을 찾지 못했습니다.",
            detail: "취소 대상 스케줄 ID가 없습니다.",
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        };
    }
    const cancelledNames = dependencies.cancelSchedules(scheduleIds);
    if (cancelledNames.length === 0) {
        return {
            ok: false,
            message: receipt || "취소할 예약 알림을 찾지 못했습니다.",
            detail: "활성 예약 알림을 찾지 못했습니다.",
            successCount: 0,
            failureCount: 1,
            receipts: defaultScheduleActionReceipts(),
        };
    }
    const summary = cancelledNames.length === 1
        ? `"${cancelledNames[0]}" 예약 알림을 취소했습니다.`
        : `${cancelledNames.length}개의 예약 알림을 취소했습니다.\n- ${cancelledNames.join("\n- ")}`;
    return {
        ok: true,
        message: receipt ? `${receipt}\n\n${summary}` : summary,
        detail: cancelledNames.join(", "),
        successCount: cancelledNames.length,
        failureCount: 0,
        receipts: [{
                kind: "schedule_cancel",
                cancelledScheduleIds: scheduleIds,
                cancelledNames,
            }],
    };
}
function getFollowupRunPayload(action) {
    const payload = action.payload.followup_run_payload;
    if (!payload || typeof payload !== "object") {
        return {};
    }
    const record = payload;
    const goal = getString(record.goal);
    const literalText = getString(record.literal_text) || getString(record.literalText);
    const destination = getString(record.destination);
    const taskProfile = getString(record.task_profile) || getString(record.taskProfile);
    const preferredTarget = getString(record.preferred_target) || getString(record.preferredTarget);
    return {
        ...(goal ? { goal } : {}),
        ...(literalText ? { literalText } : {}),
        ...(destination ? { destination } : {}),
        ...(taskProfile ? { taskProfile } : {}),
        ...(preferredTarget ? { preferredTarget } : {}),
    };
}
function getString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => Boolean(value)))];
}
function normalizeTaskProfile(taskProfile) {
    switch (taskProfile) {
        case "planning":
        case "coding":
        case "review":
        case "research":
        case "private_local":
        case "summarization":
        case "operations":
            return taskProfile;
        default:
            return "general_chat";
    }
}
function toStringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}
//# sourceMappingURL=action-execution.js.map