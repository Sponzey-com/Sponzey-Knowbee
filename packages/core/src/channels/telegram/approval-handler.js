import { eventBus } from "../../events/index.js";
import { createLogger, redactLogText } from "../../logger/index.js";
import { getRootRun } from "../../runs/store.js";
import { attachApprovalChannelBinding, describeLateApproval, getLatestApprovalForRun, hashApprovalDecisionActor, listRequestedApprovalsForChannelCallback, } from "../../runs/approval-registry.js";
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js";
import { recordLatencyMetric } from "../../observability/latency.js";
import { resolveApprovalDecision } from "../../tools/runtime-dispatcher.js";
import { appendApprovalAggregateItem, buildApprovalAggregateText, } from "../approval-aggregation.js";
import { buildTelegramApprovalCallbackNotice, buildTelegramApprovalResultLabel, resolveTelegramApprovalCallbackLanguage, } from "./approval-callback-notice.js";
import { buildApprovalKeyboard, buildResultKeyboard } from "./keyboards.js";
const log = createLogger("channel:telegram:approval");
function telegramApprovalErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
async function answerTelegramCallback(answerCallbackQuery, text) {
    try {
        if (text === undefined)
            await answerCallbackQuery();
        else
            await answerCallbackQuery(text);
    }
    catch {
        log.warn("Telegram callback acknowledgement failed; canonical callback processing will continue.");
    }
}
// Map from runId → pending approval data
const pending = new Map();
const resolvedApprovalLanguages = new Map();
// Map from sessionId → active chat info (set by bot.ts before runAgent)
export const activeChats = new Map();
const activeChatRefs = new Map();
// Most recent active chat (for single-user cases when we don't have sessionId in event)
let latestActiveChat;
let detachTelegramApprovalRequestListener = null;
export function setActiveChatForSession(sessionId, chatId, userId, threadId, language) {
    const chat = {
        chatId,
        userId,
        ...(threadId !== undefined ? { threadId } : {}),
        ...(language ? { language } : {}),
    };
    activeChats.set(sessionId, chat);
    activeChatRefs.set(sessionId, (activeChatRefs.get(sessionId) ?? 0) + 1);
    latestActiveChat = chat;
}
export function clearActiveChatForSession(sessionId) {
    const remaining = (activeChatRefs.get(sessionId) ?? 1) - 1;
    if (remaining > 0) {
        activeChatRefs.set(sessionId, remaining);
        return;
    }
    activeChatRefs.delete(sessionId);
    activeChats.delete(sessionId);
}
export function registerApprovalHandler(bot) {
    detachTelegramApprovalRequestListener?.();
    const detachRequest = eventBus.on("approval.request", async ({ approvalId, runId, parentRunId, subSessionId, agentId, teamId, toolName, params, kind = "approval", guidance, riskSummary, expiresAt, resolve }) => {
        const run = getRootRun(runId);
        if (run?.source !== "telegram") {
            return;
        }
        const target = (run ? activeChats.get(run.sessionId) : undefined) ?? latestActiveChat;
        if (target === undefined) {
            log.warn(`approval.request for runId=${runId} but no active chat`);
            return;
        }
        const observedAt = Date.now();
        const paramsStr = JSON.stringify(params, null, 2).slice(0, 300);
        const existing = pending.get(runId);
        const language = existing?.language ?? target.language ?? "ko";
        const aggregated = appendApprovalAggregateItem(existing?.context, {
            ...(approvalId ? { approvalId } : {}),
            runId,
            ...(parentRunId ? { parentRunId } : {}),
            ...(subSessionId ? { subSessionId } : {}),
            ...(agentId ? { agentId } : {}),
            ...(teamId ? { teamId } : {}),
            toolName,
            kind,
            ...(riskSummary ? { riskSummary } : {}),
            ...(guidance ? { guidance } : {}),
            paramsPreview: paramsStr,
            ...(!approvalId ? { resolve } : {}),
        }, target.userId, observedAt);
        const text = buildApprovalAggregateText({ context: aggregated.context, channel: "telegram", language });
        let sentMsgId = existing?.messageId;
        try {
            const keyboard = buildApprovalKeyboard(runId, language);
            const sendOpts = target.threadId !== undefined
                ? { reply_markup: keyboard, message_thread_id: target.threadId }
                : { reply_markup: keyboard };
            if (existing) {
                await bot.api.editMessageText(existing.chatId, existing.messageId, text, { reply_markup: keyboard });
            }
            else {
                const msg = await bot.api.sendMessage(target.chatId, text, sendOpts);
                sentMsgId = msg.message_id;
            }
        }
        catch (err) {
            const errMsg = telegramApprovalErrorMessage(err);
            log.error(`Failed to send approval message: ${errMsg}`);
            return;
        }
        if (approvalId && sentMsgId !== undefined) {
            attachApprovalChannelBinding({
                approvalId,
                channelMessageId: telegramApprovalChannelMessageId(target.chatId, target.threadId, sentMsgId),
                decisionActorFingerprint: hashApprovalDecisionActor({
                    channel: "telegram",
                    actorId: String(target.userId),
                }),
            });
        }
        const timeout = existing?.timeout ?? (kind === "screen_confirmation"
            ? null
            : setTimeout(() => {
                const entry = pending.get(runId);
                if (!entry)
                    return;
                resolvedApprovalLanguages.set(runId, entry.language);
                pending.delete(runId);
                const resolvedItems = resolveTelegramApprovalAggregate(entry.context, "deny", "timeout");
                for (const item of resolvedItems) {
                    eventBus.emit("approval.resolved", { ...(item.approvalId ? { approvalId: item.approvalId } : {}), runId, decision: "deny", toolName: item.toolName, kind: item.kind, reason: "timeout" });
                }
            }, expiresAt ? Math.max(0, expiresAt - Date.now()) : 60_000));
        pending.set(runId, {
            context: aggregated.context,
            chatId: target.chatId,
            messageId: sentMsgId ?? 0,
            requesterId: target.userId,
            language,
            timeout,
        });
        if (existing && aggregated.appended && aggregated.aggregationLatencyMs !== null) {
            recordLatencyMetric({
                name: "approval_aggregation_latency_ms",
                durationMs: aggregated.aggregationLatencyMs,
                runId,
                sessionId: run.sessionId,
                detail: {
                    channel: "telegram",
                    approvalCount: aggregated.context.items.length,
                    toolName,
                    kind,
                    approvalId: approvalId ?? null,
                },
            });
        }
        recordMessageLedgerEvent({
            runId,
            ...(parentRunId ? { parentRunId } : {}),
            ...(subSessionId ? { subSessionId } : {}),
            ...(agentId ? { agentId } : {}),
            ...(teamId ? { teamId } : {}),
            channel: "telegram",
            eventKind: existing ? "approval_aggregated" : "approval_requested",
            deliveryKind: "approval",
            status: "pending",
            summary: existing ? "Telegram 승인 요청을 기존 pending 항목에 집계했습니다." : "Telegram 승인 요청을 전송했습니다.",
            detail: {
                approvalId: approvalId ?? null,
                approvalCount: aggregated.context.items.length,
                aggregationLatencyMs: aggregated.aggregationLatencyMs,
                toolName,
                kind,
                riskSummary: riskSummary ?? null,
            },
        });
    });
    const detachResolved = eventBus.on("approval.resolved", ({ runId }) => {
        const entry = pending.get(runId);
        if (entry?.timeout)
            clearTimeout(entry.timeout);
        if (entry?.language)
            resolvedApprovalLanguages.set(runId, entry.language);
        pending.delete(runId);
    });
    detachTelegramApprovalRequestListener = () => {
        detachRequest();
        detachResolved();
    };
    bot.on("callback_query:data", async (ctx) => {
        const data = ctx.callbackQuery.data;
        const from = ctx.from;
        const callbackLanguage = resolveTelegramApprovalCallbackLanguage(ctx.from?.language_code);
        if (data === "noop") {
            await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx));
            return;
        }
        const approveOnceMatch = /^approve:([^:]+):once$/.exec(data);
        const approveAllMatch = /^approve:([^:]+):all$/.exec(data);
        const denyMatch = /^deny:([^:]+)$/.exec(data);
        const runId = approveOnceMatch?.[1] ?? approveAllMatch?.[1] ?? denyMatch?.[1];
        if (runId === undefined) {
            await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx));
            return;
        }
        const decision = approveAllMatch !== null
            ? "allow_run"
            : approveOnceMatch !== null
                ? "allow_once"
                : "deny";
        const entry = pending.get(runId);
        if (entry === undefined) {
            const language = resolvedApprovalLanguages.get(runId) ?? callbackLanguage;
            const callbackMessage = ctx.callbackQuery.message;
            const callbackMessageId = callbackMessage
                ? telegramApprovalChannelMessageId(callbackMessage.chat.id, callbackMessage.message_thread_id, callbackMessage.message_id)
                : undefined;
            const restartBound = callbackMessageId
                ? listRequestedApprovalsForChannelCallback({
                    runId,
                    channel: "telegram",
                    channelMessageId: callbackMessageId,
                    decisionActorFingerprint: hashApprovalDecisionActor({
                        channel: "telegram",
                        actorId: String(from.id),
                    }),
                })
                : [];
            const accepted = restartBound.filter((approval) => {
                try {
                    return resolveApprovalDecision({
                        approvalId: approval.id,
                        runId,
                        decision,
                        decisionBy: "telegram",
                        decisionSource: "user",
                    }).accepted;
                }
                catch {
                    return false;
                }
            });
            if (accepted.length > 0 && callbackMessage) {
                const primaryKind = accepted[0]?.kind ?? "approval";
                const username = from.first_name ?? from.username ?? String(from.id);
                const resultLabel = buildTelegramApprovalResultLabel({
                    language,
                    approvalKind: primaryKind,
                    decision,
                    username,
                });
                try {
                    await bot.api.editMessageReplyMarkup(callbackMessage.chat.id, callbackMessage.message_id, { reply_markup: buildResultKeyboard(resultLabel) });
                }
                catch {
                    // best-effort
                }
                await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx), buildTelegramApprovalCallbackNotice({
                    language,
                    reason: "decision",
                    approvalKind: primaryKind,
                    decision,
                }).text);
                for (const approval of accepted) {
                    eventBus.emit("approval.resolved", {
                        approvalId: approval.id,
                        runId,
                        decision,
                        toolName: approval.tool_name,
                        kind: approval.kind,
                        reason: "user",
                    });
                }
                return;
            }
            const lateMessage = describeLateApproval(getLatestApprovalForRun(runId), language);
            const notFoundMessage = describeLateApproval(undefined, language);
            await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx), buildTelegramApprovalCallbackNotice({
                language,
                reason: "late",
                text: lateMessage === notFoundMessage
                    ? buildTelegramApprovalCallbackNotice({ language, reason: "late" }).text
                    : lateMessage,
            }).text);
            return;
        }
        if (from.id !== entry.requesterId) {
            await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx), buildTelegramApprovalCallbackNotice({
                language: callbackLanguage,
                reason: "unauthorized",
            }).text);
            return;
        }
        const language = entry.language;
        if (entry.timeout)
            clearTimeout(entry.timeout);
        resolvedApprovalLanguages.set(runId, entry.language);
        pending.delete(runId);
        const primary = entry.context.items[0];
        const primaryKind = primary?.kind ?? "approval";
        const username = from.first_name ?? from.username ?? String(from.id);
        const resultLabel = buildTelegramApprovalResultLabel({
            language,
            approvalKind: primaryKind,
            decision,
            username,
        });
        try {
            await bot.api.editMessageReplyMarkup(entry.chatId, entry.messageId, {
                reply_markup: buildResultKeyboard(resultLabel),
            });
        }
        catch {
            // best-effort
        }
        await answerTelegramCallback(ctx.answerCallbackQuery.bind(ctx), buildTelegramApprovalCallbackNotice({
            language,
            reason: "decision",
            approvalKind: primaryKind,
            decision,
        }).text);
        const resolvedItems = resolveTelegramApprovalAggregate(entry.context, decision, "user");
        for (const item of resolvedItems) {
            eventBus.emit("approval.resolved", { ...(item.approvalId ? { approvalId: item.approvalId } : {}), runId, decision, toolName: item.toolName, kind: item.kind, reason: "user" });
        }
    });
}
function resolveTelegramApprovalAggregate(context, decision, reason) {
    for (const item of context.items) {
        if (item.approvalId) {
            try {
                resolveApprovalDecision({
                    approvalId: item.approvalId,
                    runId: item.runId,
                    decision,
                    decisionBy: "telegram",
                    decisionSource: reason,
                });
            }
            catch {
                // The durable command remains authoritative; a missing live dispatcher
                // must not turn the channel callback into an in-memory approval.
            }
            continue;
        }
        item.resolve?.(decision, reason);
    }
    return [...context.items];
}
export function resetTelegramApprovalStateForTest() {
    detachTelegramApprovalRequestListener?.();
    detachTelegramApprovalRequestListener = null;
    for (const entry of pending.values()) {
        if (entry.timeout)
            clearTimeout(entry.timeout);
    }
    pending.clear();
    resolvedApprovalLanguages.clear();
    activeChats.clear();
    activeChatRefs.clear();
    latestActiveChat = undefined;
}
function telegramApprovalChannelMessageId(chatId, threadId, messageId) {
    return `telegram:${chatId}:${threadId ?? "main"}:${messageId}`;
}
//# sourceMappingURL=approval-handler.js.map