import { getActiveTelegramChannel } from "../channels/telegram/runtime.js";
import { SlackResponder } from "../channels/slack/responder.js";
import { recordLatencyMetric } from "../observability/latency.js";
import { buildDeliveryDedupeKey, buildPayloadHash, formatContractValidationFailureForUser, toCanonicalJson, validateScheduleContract, } from "../contracts/index.js";
import { getArtifactMetadata, getScheduleDeliveryReceipt, getSession, insertScheduleDeliveryReceipt, } from "../db/index.js";
import { parseScheduleContractJson } from "../schedules/candidates.js";
import { enqueueScheduledDelivery } from "./delivery-queue.js";
import { redactLogText } from "../logger/index.js";
import { startIngressRun } from "../runs/ingress.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
function scheduleContractErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
function logInfo(dependencies, message, payload) {
    dependencies?.logInfo?.(message, payload);
}
function logWarn(dependencies, message) {
    dependencies?.logWarn?.(message);
}
function logError(dependencies, message, payload) {
    dependencies?.logError?.(message, payload);
}
function normalizeDeliveryChannel(channel) {
    switch (channel) {
        case "telegram":
        case "slack":
        case "webui":
        case "local":
        case "agent":
        case "none":
            return channel;
        default:
            return "agent";
    }
}
function resolveEffectiveDelivery(contract, schedule) {
    const delivery = contract.delivery;
    const channel = delivery.channel === "current_session"
        ? normalizeDeliveryChannel(schedule.target_channel)
        : delivery.channel;
    return {
        ...delivery,
        channel,
        sessionId: delivery.sessionId ?? schedule.target_session_id ?? null,
    };
}
export function resolveScheduleDueAt(params) {
    const match = /\bdue:\s*([^\)]+)\)/u.exec(params.trigger);
    if (match?.[1]) {
        const dueAt = new Date(match[1].trim());
        if (!Number.isNaN(dueAt.getTime()))
            return dueAt.toISOString();
    }
    return `manual:${params.scheduleRunId}:${params.startedAt}`;
}
export function buildScheduledAgentExecutionBrief(params) {
    const contractJson = toCanonicalJson(params.contract, { omitKeys: new Set(["rawText"]) });
    return loadPromptValue("scheduled_contract_execution_user", {
        scheduleId: params.schedule.id,
        scheduleName: params.schedule.name,
        dueAt: params.dueAt,
        targetChannel: params.schedule.target_channel,
        targetSessionId: params.schedule.target_session_id ?? "none",
        contractJson,
    }, { required: true });
}
function buildDeliveryPlan(params) {
    const delivery = resolveEffectiveDelivery(params.contract, params.schedule);
    const payloadHash = buildPayloadHash(params.contract.payload);
    const dueAt = resolveScheduleDueAt({
        trigger: params.trigger,
        scheduleRunId: params.scheduleRunId,
        startedAt: params.startedAt,
    });
    const dedupeKey = buildDeliveryDedupeKey({
        scheduleId: params.schedule.id,
        dueAt,
        delivery,
        payloadHash,
    });
    const receipt = getScheduleDeliveryReceipt(dedupeKey);
    return {
        delivery,
        payloadHash,
        dueAt,
        dedupeKey,
        existingDelivered: receipt?.delivery_status === "delivered" && delivery.explicitResend !== true,
    };
}
function recordDeliveryReceipt(params) {
    insertScheduleDeliveryReceipt({
        dedupe_key: params.plan.dedupeKey,
        schedule_id: params.schedule.id,
        schedule_run_id: params.scheduleRunId,
        due_at: params.plan.dueAt,
        target_channel: params.plan.delivery.channel,
        target_session_id: params.plan.delivery.sessionId ?? null,
        payload_hash: params.plan.payloadHash,
        delivery_status: params.status,
        summary: params.summary,
        error: params.error,
    });
}
async function defaultTelegramTextDelivery(sessionId, text) {
    const telegram = getActiveTelegramChannel();
    if (!telegram)
        throw new Error("telegram channel is not running");
    return telegram.sendTextToSession(sessionId, text);
}
async function defaultTelegramFileDelivery(sessionId, filePath, caption) {
    const telegram = getActiveTelegramChannel();
    if (!telegram)
        throw new Error("telegram channel is not running");
    return telegram.sendFileToSession(sessionId, filePath, caption);
}
function resolveSlackTarget(sessionId) {
    const session = getSession(sessionId);
    if (!session || session.source !== "slack" || !session.source_id) {
        throw new Error(`Slack session ${sessionId} not found`);
    }
    const match = /^slack:([^:]+):(.+)$/u.exec(session.source_id);
    if (!match)
        throw new Error(`Slack session ${sessionId} has invalid source_id`);
    const channelId = match[1];
    const threadTs = match[2];
    if (!channelId || !threadTs)
        throw new Error(`Slack session ${sessionId} has invalid source_id`);
    return { channelId, threadTs };
}
async function defaultSlackTextDelivery(sessionId, text, config) {
    if (!config.slack?.enabled || !config.slack.botToken) {
        throw new Error("slack channel is not configured");
    }
    const target = resolveSlackTarget(sessionId);
    return new SlackResponder(config.slack, target.channelId, target.threadTs).sendFinalResponse(text);
}
async function defaultSlackFileDelivery(sessionId, filePath, config, caption) {
    if (!config.slack?.enabled || !config.slack.botToken) {
        throw new Error("slack channel is not configured");
    }
    const target = resolveSlackTarget(sessionId);
    return new SlackResponder(config.slack, target.channelId, target.threadTs).sendFile(filePath, caption);
}
async function deliverText(params) {
    const summary = params.text.slice(0, 2000) || null;
    if (params.plan.existingDelivered) {
        return {
            success: true,
            summary: "이미 전송된 예약 실행 회차라 중복 전송을 건너뛰었습니다.",
            error: null,
            executionSuccess: null,
            deliverySuccess: true,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: null,
        };
    }
    try {
        switch (params.plan.delivery.channel) {
            case "telegram": {
                const sessionId = params.plan.delivery.sessionId;
                if (!sessionId)
                    throw new Error("telegram target session is not configured for this schedule");
                const deliver = params.dependencies?.deliverTelegramText ?? defaultTelegramTextDelivery;
                await enqueueScheduledDelivery({
                    targetChannel: "telegram",
                    targetSessionId: sessionId,
                    scheduleId: params.schedule.id,
                    scheduleRunId: params.scheduleRunId,
                    task: () => deliver(sessionId, params.text),
                }, {
                    logInfo: (message, payload) => logInfo(params.dependencies, message, payload),
                    logWarn: (message) => logWarn(params.dependencies, message),
                    logError: (message, payload) => logError(params.dependencies, message, payload),
                });
                break;
            }
            case "slack": {
                const sessionId = params.plan.delivery.sessionId;
                if (!sessionId)
                    throw new Error("slack target session is not configured for this schedule");
                const deliver = params.dependencies?.deliverSlackText
                    ?? ((sessionId, text) => defaultSlackTextDelivery(sessionId, text, params.config));
                await enqueueScheduledDelivery({
                    targetChannel: "slack",
                    targetSessionId: sessionId,
                    scheduleId: params.schedule.id,
                    scheduleRunId: params.scheduleRunId,
                    task: () => deliver(sessionId, params.text),
                }, {
                    logInfo: (message, payload) => logInfo(params.dependencies, message, payload),
                    logWarn: (message) => logWarn(params.dependencies, message),
                    logError: (message, payload) => logError(params.dependencies, message, payload),
                });
                break;
            }
            case "agent":
            case "local":
            case "webui":
            case "none":
                break;
            default:
                throw new Error(`unsupported schedule delivery channel: ${params.plan.delivery.channel}`);
        }
        recordDeliveryReceipt({
            plan: params.plan,
            schedule: params.schedule,
            scheduleRunId: params.scheduleRunId,
            status: "delivered",
            summary,
            error: null,
        });
        return {
            success: true,
            summary,
            error: null,
            executionSuccess: true,
            deliverySuccess: true,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: null,
        };
    }
    catch (error) {
        const message = scheduleContractErrorMessage(error);
        recordDeliveryReceipt({
            plan: params.plan,
            schedule: params.schedule,
            scheduleRunId: params.scheduleRunId,
            status: "failed",
            summary,
            error: message,
        });
        return {
            success: false,
            summary,
            error: message,
            executionSuccess: true,
            deliverySuccess: false,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: message,
        };
    }
}
async function executeCanonicalTask(params) {
    const brief = buildScheduledAgentExecutionBrief({
        schedule: params.schedule,
        contract: params.contract,
        dueAt: params.plan.dueAt,
    });
    const chunks = [];
    let errorMsg = null;
    try {
        const start = params.dependencies?.startIngressRunImpl ?? startIngressRun;
        const { started } = start({
            artifactStorage: params.artifactStorage,
            memoryJournal: params.memoryJournal,
            hierarchyStorage: params.hierarchyStorage,
            runId: params.scheduleRunId,
            message: brief,
            sessionId: `schedule:${params.schedule.id}:${params.scheduleRunId}`,
            requestGroupId: params.scheduleRunId,
            originRunId: params.schedule.origin_run_id ?? undefined,
            originRequestGroupId: params.schedule.origin_request_group_id ?? undefined,
            scheduleId: params.schedule.id,
            includeScheduleMemory: true,
            memorySearchQuery: params.schedule.name,
            contextMode: "isolated",
            model: params.schedule.model ?? undefined,
            config: params.config,
            source: "scheduler",
            responseLanguageMode: params.contract.responseLanguageMode ?? "same_as_request",
            onChunk: (chunk) => {
                if (chunk.type === "text")
                    chunks.push(chunk.delta);
                if (chunk.type === "error")
                    errorMsg = chunk.message;
                return undefined;
            },
        });
        const completedRun = await started.finished;
        if (completedRun?.status !== "completed") {
            return {
                success: false,
                summary: null,
                error: errorMsg ?? completedRun?.summary ?? "canonical scheduled agent run did not complete successfully",
                executionSuccess: false,
                deliverySuccess: null,
                retryable: false,
            };
        }
    }
    catch (error) {
        errorMsg = scheduleContractErrorMessage(error);
    }
    const rawText = chunks.join("").trim();
    if (errorMsg) {
        return { success: false, summary: null, error: errorMsg, executionSuccess: false, deliverySuccess: null, retryable: false };
    }
    if (!rawText) {
        return { success: false, summary: null, error: "scheduled agent task produced no deliverable text", executionSuccess: true, deliverySuccess: false, retryable: false };
    }
    return deliverText({
        schedule: params.schedule,
        scheduleRunId: params.scheduleRunId,
        plan: params.plan,
        text: rawText,
        config: params.config,
        dependencies: params.dependencies,
    });
}
async function executeArtifactDelivery(params) {
    const artifactId = params.contract.payload.artifactId ?? params.plan.delivery.artifactId;
    if (!artifactId) {
        return { success: false, summary: null, error: "scheduled artifact delivery is missing artifactId", executionSuccess: false, deliverySuccess: null };
    }
    const artifact = getArtifactMetadata(artifactId);
    if (!artifact) {
        return { success: false, summary: null, error: `scheduled artifact was not found: ${artifactId}`, executionSuccess: false, deliverySuccess: null };
    }
    if (params.plan.existingDelivered) {
        return {
            success: true,
            summary: "이미 전송된 예약 실행 회차라 중복 파일 전송을 건너뛰었습니다.",
            error: null,
            executionSuccess: null,
            deliverySuccess: true,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: null,
        };
    }
    try {
        switch (params.plan.delivery.channel) {
            case "slack": {
                const sessionId = params.plan.delivery.sessionId;
                if (!sessionId)
                    throw new Error("slack target session is not configured for this schedule");
                const deliver = params.dependencies?.deliverSlackFile
                    ?? ((sessionId, filePath, caption) => defaultSlackFileDelivery(sessionId, filePath, params.config, caption));
                await enqueueScheduledDelivery({
                    targetChannel: "slack",
                    targetSessionId: sessionId,
                    scheduleId: params.schedule.id,
                    scheduleRunId: params.scheduleRunId,
                    task: () => deliver(sessionId, artifact.artifact_path, params.contract.summary ?? params.contract.displayName ?? undefined),
                }, {
                    logInfo: (message, payload) => logInfo(params.dependencies, message, payload),
                    logWarn: (message) => logWarn(params.dependencies, message),
                    logError: (message, payload) => logError(params.dependencies, message, payload),
                });
                break;
            }
            case "telegram": {
                const sessionId = params.plan.delivery.sessionId;
                if (!sessionId)
                    throw new Error("telegram target session is not configured for this schedule");
                const deliver = params.dependencies?.deliverTelegramFile ?? defaultTelegramFileDelivery;
                await enqueueScheduledDelivery({
                    targetChannel: "telegram",
                    targetSessionId: sessionId,
                    scheduleId: params.schedule.id,
                    scheduleRunId: params.scheduleRunId,
                    task: () => deliver(sessionId, artifact.artifact_path, params.contract.summary ?? params.contract.displayName ?? undefined),
                }, {
                    logInfo: (message, payload) => logInfo(params.dependencies, message, payload),
                    logWarn: (message) => logWarn(params.dependencies, message),
                    logError: (message, payload) => logError(params.dependencies, message, payload),
                });
                break;
            }
            default:
                throw new Error(`artifact delivery is not supported for channel: ${params.plan.delivery.channel}`);
        }
        recordDeliveryReceipt({
            plan: params.plan,
            schedule: params.schedule,
            scheduleRunId: params.scheduleRunId,
            status: "delivered",
            summary: artifact.artifact_path,
            error: null,
        });
        return {
            success: true,
            summary: artifact.artifact_path,
            error: null,
            executionSuccess: true,
            deliverySuccess: true,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: null,
        };
    }
    catch (error) {
        const message = scheduleContractErrorMessage(error);
        recordDeliveryReceipt({
            plan: params.plan,
            schedule: params.schedule,
            scheduleRunId: params.scheduleRunId,
            status: "failed",
            summary: artifact.artifact_path,
            error: message,
        });
        return {
            success: false,
            summary: artifact.artifact_path,
            error: message,
            executionSuccess: true,
            deliverySuccess: false,
            deliveryDedupeKey: params.plan.dedupeKey,
            deliveryError: message,
        };
    }
}
export async function executeScheduleContract(input) {
    const parsed = parseScheduleContractJson(input.schedule.contract_json);
    if (!parsed)
        return { handled: false };
    const validation = validateScheduleContract(parsed);
    if (!validation.ok) {
        return {
            handled: true,
            result: {
                success: false,
                summary: null,
                error: formatContractValidationFailureForUser(validation.issues),
                executionSuccess: false,
                deliverySuccess: null,
            },
        };
    }
    const contract = validation.value;
    const plan = buildDeliveryPlan({
        schedule: input.schedule,
        scheduleRunId: input.scheduleRunId,
        trigger: input.trigger,
        startedAt: input.startedAt,
        contract,
    });
    if (plan.existingDelivered) {
        return {
            handled: true,
            result: {
                success: true,
                summary: "이미 전송된 예약 실행 회차라 중복 실행을 건너뛰었습니다.",
                error: null,
                executionSuccess: null,
                deliverySuccess: true,
                deliveryDedupeKey: plan.dedupeKey,
                deliveryError: null,
            },
        };
    }
    const config = input.config;
    switch (contract.payload.kind) {
        case "literal_message": {
            const directStartedAt = Date.now();
            const text = contract.payload.literalText?.trim();
            if (!text) {
                return {
                    handled: true,
                    result: { success: false, summary: null, error: "scheduled literal message is empty", executionSuccess: false, deliverySuccess: null },
                };
            }
            const result = await deliverText({
                schedule: input.schedule,
                scheduleRunId: input.scheduleRunId,
                plan,
                text,
                config,
                dependencies: input.dependencies,
            });
            recordLatencyMetric({
                name: "schedule_tick_direct_execution_latency_ms",
                durationMs: Date.now() - directStartedAt,
                runId: input.scheduleRunId,
                requestGroupId: input.schedule.id,
                source: "scheduler",
                detail: {
                    scheduleId: input.schedule.id,
                    payloadKind: "literal_message",
                    deliveryChannel: plan.delivery.channel,
                    deliveryDedupeKey: plan.dedupeKey,
                },
            });
            return {
                handled: true,
                result,
            };
        }
        case "tool_task":
            if (!contract.payload.toolName?.trim()) {
                return {
                    handled: true,
                    result: {
                        success: false,
                        summary: null,
                        error: "scheduled tool task is missing toolName",
                        executionSuccess: false,
                        deliverySuccess: null,
                        retryable: false,
                    },
                };
            }
            return {
                handled: true,
                result: await executeCanonicalTask({ artifactStorage: input.artifactStorage, memoryJournal: input.memoryJournal, hierarchyStorage: input.hierarchyStorage, schedule: input.schedule, scheduleRunId: input.scheduleRunId, contract, plan, config, dependencies: input.dependencies }),
            };
        case "agent_task":
            return {
                handled: true,
                result: await executeCanonicalTask({ artifactStorage: input.artifactStorage, memoryJournal: input.memoryJournal, hierarchyStorage: input.hierarchyStorage, schedule: input.schedule, scheduleRunId: input.scheduleRunId, contract, plan, config, dependencies: input.dependencies }),
            };
        case "artifact_delivery":
            return {
                handled: true,
                result: await executeArtifactDelivery({ artifactStorage: input.artifactStorage, schedule: input.schedule, scheduleRunId: input.scheduleRunId, contract, plan, config, dependencies: input.dependencies }),
            };
        default:
            return {
                handled: true,
                result: { success: false, summary: null, error: `unsupported schedule payload kind: ${contract.payload.kind}`, executionSuccess: false, deliverySuccess: null },
            };
    }
}
//# sourceMappingURL=contract-executor.js.map