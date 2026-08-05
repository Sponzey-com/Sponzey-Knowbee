import { Bot } from "grammy";
import { getSession, insertChannelMessageRef } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { createLogger, redactLogText } from "../../logger/index.js";
import { submitUserRequest } from "../../runs/ingress.js";
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js";
import { cancelRootRun, getRootRun } from "../../runs/store.js";
import { buildAccessPolicyFromAllowedIds, evaluateInboundAccessPolicy, recordChannelAccessPolicyResult, } from "../access-policy.js";
import { resolveChannelContinuation } from "../continuation.js";
import { buildChannelIngressFailureNotice } from "../ingress-failure-notice.js";
import { deliverIntakeAcknowledgementControl, } from "../intake-acknowledgement-control.js";
import { detectPrimaryMessageLanguage } from "../language.js";
import { renderChannelNoticeText, } from "../notice-rendering.js";
import { clearActiveChatForSession, registerApprovalHandler, setActiveChatForSession, } from "./approval-handler.js";
import { buildTelegramAttachmentDownloadFailureNotice, resolveTelegramAttachmentNoticeLanguage, } from "./attachment-notice.js";
import { telegramAllowedRoomIdsForChatType, telegramRoomTypeForChatType } from "./auth.js";
import { createTelegramChunkDeliveryHandler } from "./chunk-delivery.js";
import { registerCommands } from "./commands.js";
import { FileHandler } from "./file-handler.js";
import { TelegramResponder } from "./responder.js";
import { setTelegramRuntimeError } from "./runtime.js";
import { getOrCreateTelegramSession, newSession, parseTelegramSessionKey, resolveSessionKey, } from "./session.js";
import { TypingIndicator } from "./typing.js";
const log = createLogger("channel:telegram");
function telegramBotErrorMessage(error) {
    const raw = error instanceof Error
        ? error.message
        : typeof error?.message === "string"
            ? error.message
            : String(error);
    return redactLogText(raw);
}
export function resolveTelegramInboundMessageLanguage(text) {
    const language = detectPrimaryMessageLanguage(text);
    return language === "unknown" ? "en" : language;
}
export function resolveTelegramAttachmentFailureLanguage(caption, languageCode) {
    const captionLanguage = detectPrimaryMessageLanguage(caption ?? "");
    return captionLanguage === "unknown"
        ? resolveTelegramAttachmentNoticeLanguage(languageCode)
        : captionLanguage;
}
function telegramAttachmentFailureOriginalRequest(caption, attachmentKind) {
    const normalizedCaption = caption?.trim();
    return normalizedCaption && normalizedCaption.length > 0
        ? normalizedCaption
        : `Telegram ${attachmentKind} attachment request`;
}
async function replyTelegramAttachmentFailureNotice(params) {
    const renderedNotice = await renderChannelNoticeText({
        originalRequest: params.originalRequest,
        rawText: params.rawText,
        ...(params.dependencies ? { dependencies: params.dependencies } : {}),
    });
    if (renderedNotice.status === "ready") {
        await params.reply(renderedNotice.text);
    }
    else {
        log.warn(`Skipped Telegram attachment failure notice delivery: ${renderedNotice.reason}`);
    }
}
async function sendTelegramContinuationConfirmation(params) {
    const renderedNotice = await renderChannelNoticeText({
        originalRequest: params.originalRequest,
        rawText: params.rawText,
        ...(params.dependencies ? { dependencies: params.dependencies } : {}),
    });
    if (renderedNotice.status === "ready") {
        await params.responder.sendReceipt(renderedNotice.text);
    }
    else {
        log.warn(`Skipped Telegram continuation confirmation delivery: ${renderedNotice.reason}`);
    }
}
async function sendTelegramIngressReceipt(params) {
    const result = await deliverIntakeAcknowledgementControl({
        control: params.control,
        deliver: (text) => params.responder.sendIntakeAcknowledgement(text),
        onFailure: (error) => log.fieldDebug(`Telegram intake acknowledgement delivery failed: ${telegramBotErrorMessage(error)}`),
    });
    return result.status === "delivered" ? result.reference : undefined;
}
export function findTelegramReplyTaskRef(params) {
    if (params.replyToMessageId === undefined)
        return undefined;
    const result = resolveChannelContinuation({
        envelope: buildTelegramContinuationEnvelope({
            chatId: params.chatId,
            messageId: params.replyToMessageId,
            replyToMessageId: params.replyToMessageId,
            ...(params.threadId !== undefined ? { threadId: params.threadId } : {}),
        }),
    });
    if (result.selected?.messageRef)
        return result.selected.messageRef;
    return result.selected
        ? {
            id: `continuation:${result.selected.source}:${result.selected.externalMessageId ?? result.selected.runId}`,
            source: "telegram",
            session_id: result.selected.sessionId ?? "",
            root_run_id: result.selected.runId,
            request_group_id: result.selected.requestGroupId,
            external_chat_id: result.selected.externalChatId ?? String(params.chatId),
            external_thread_id: result.selected.externalThreadId ?? null,
            external_message_id: result.selected.externalMessageId ?? String(params.replyToMessageId),
            role: "assistant",
            created_at: result.selected.createdAt,
        }
        : undefined;
}
function buildTelegramContinuationEnvelope(params) {
    return {
        channelId: "telegram:primary",
        provider: "telegram",
        connectionId: "telegram:primary",
        messageId: String(params.messageId),
        ...(params.threadId !== undefined ? { threadId: String(params.threadId) } : {}),
        ...(params.replyToMessageId !== undefined
            ? { replyToMessageId: String(params.replyToMessageId) }
            : {}),
        sender: { id: String(params.userId ?? 0), providerType: "user" },
        room: {
            id: String(params.chatId),
            type: telegramRoomTypeForChatType(params.chatType ?? "unknown"),
        },
        text: params.text ?? "",
        attachments: [],
        mentions: [],
        timestamp: Date.now(),
        rawPayloadRef: {
            storage: "none",
            redactionState: "not_stored",
            provider: "telegram",
            createdAt: Date.now(),
        },
        ...(params.replyToMessageId !== undefined
            ? {
                continuationContext: {
                    parentMessageId: String(params.replyToMessageId),
                    source: "reply",
                },
            }
            : {}),
        dedupeKey: `telegram:${params.chatId}:${params.threadId ?? "main"}:${params.messageId}`,
    };
}
export class TelegramChannel {
    config;
    artifactStorage;
    noticeRendering;
    memoryJournal;
    hierarchyStorage;
    bot;
    runningRuns = new Map();
    sessionIds = new Map();
    fileHandler;
    pollingTask = null;
    liveSmokeSequence = 0;
    liveSmokeStartObservers = new Map();
    constructor(config, artifactStorage, noticeRendering, memoryJournal, hierarchyStorage) {
        this.config = config;
        this.artifactStorage = artifactStorage;
        this.noticeRendering = noticeRendering;
        this.memoryJournal = memoryJournal;
        this.hierarchyStorage = hierarchyStorage;
        this.bot = new Bot(config.botToken);
        this.fileHandler = new FileHandler(this.bot, artifactStorage);
        this._registerHandlers();
    }
    getSessionKey(chatId, threadId) {
        return resolveSessionKey(chatId, threadId);
    }
    newSession(sessionKey) {
        const runIds = this.runningRuns.get(sessionKey);
        if (runIds) {
            for (const runId of runIds) {
                cancelRootRun(runId);
            }
            this.runningRuns.delete(sessionKey);
        }
        const sessionId = newSession(sessionKey);
        this.sessionIds.set(sessionKey, sessionId);
    }
    abortSession(sessionKey) {
        const runIds = this.runningRuns.get(sessionKey);
        if (!runIds || runIds.size === 0)
            return false;
        let cancelledAny = false;
        for (const runId of runIds) {
            const cancelled = cancelRootRun(runId);
            cancelledAny = cancelledAny || cancelled !== undefined;
        }
        this.runningRuns.delete(sessionKey);
        return cancelledAny;
    }
    getRunningCount() {
        return [...this.runningRuns.values()].reduce((sum, runIds) => sum + runIds.size, 0);
    }
    getSessionStatus(sessionKey) {
        const runIds = this.runningRuns.get(sessionKey);
        const latestRunId = runIds ? [...runIds][runIds.size - 1] : undefined;
        return {
            sessionId: this.sessionIds.get(sessionKey),
            runId: latestRunId,
            running: Boolean(runIds && runIds.size > 0),
        };
    }
    createPendingResponseDeliveryHandler(input) {
        const session = getSession(input.sessionId);
        if (!session || session.source !== "telegram" || !session.source_id)
            return undefined;
        const target = parseTelegramSessionKey(session.source_id);
        if (!target)
            return undefined;
        const responder = new TelegramResponder(this.bot, target.chatId, target.threadId, input.language);
        return createTelegramChunkDeliveryHandler({
            artifactStorage: this.artifactStorage,
            responder,
            sessionId: input.sessionId,
            chatId: target.chatId,
            ...(target.threadId !== undefined ? { threadId: target.threadId } : {}),
            ...(input.language ? { language: input.language } : {}),
            getRunId: () => input.runId,
            deliveryKind: "final",
            noticeRendering: this.noticeRendering,
            recordOutgoingMessageRef: (params) => this.recordOutgoingMessageRef(params),
            logError: (message) => log.error(message),
        });
    }
    async acceptLiveSmokeRequest(input) {
        if (!this.bot.isRunning())
            throw new Error("telegram_live_smoke_runtime_unavailable");
        if (!this.config.allowedUserIds.includes(input.target.userId)) {
            throw new Error("telegram_live_smoke_target_not_allowed");
        }
        if (input.target.chatId !== input.target.userId &&
            !this.config.allowedGroupIds.includes(input.target.chatId)) {
            throw new Error("telegram_live_smoke_target_not_allowed");
        }
        const request = input.request.trim();
        if (!request)
            throw new Error("telegram_live_smoke_request_required");
        this.liveSmokeSequence = (this.liveSmokeSequence + 1) % 1_000_000;
        const messageId = 1_000_000_000 + ((Date.now() + this.liveSmokeSequence) % 1_000_000_000);
        const channelEventId = `${input.target.chatId}:${input.target.threadId ?? "main"}:${messageId}`;
        let started;
        this.liveSmokeStartObservers.set(channelEventId, (receipt) => {
            started = receipt;
        });
        try {
            await this.bot.handleUpdate({
                update_id: messageId,
                message: {
                    message_id: messageId,
                    date: Math.floor(Date.now() / 1_000),
                    chat: input.target.chatId === input.target.userId
                        ? {
                            id: input.target.chatId,
                            type: "private",
                            first_name: "Knowbee smoke",
                        }
                        : {
                            id: input.target.chatId,
                            type: "supergroup",
                            title: "Knowbee smoke",
                            ...(input.target.threadId === undefined ? {} : { is_forum: true }),
                        },
                    from: {
                        id: input.target.userId,
                        is_bot: false,
                        first_name: "Knowbee smoke",
                        language_code: "en",
                    },
                    text: request,
                    ...(input.target.threadId === undefined
                        ? {}
                        : { message_thread_id: input.target.threadId, is_topic_message: true }),
                },
            });
        }
        finally {
            this.liveSmokeStartObservers.delete(channelEventId);
        }
        if (!started)
            throw new Error("telegram_live_smoke_ingress_not_started");
        return started;
    }
    addSessionRun(sessionKey, runId) {
        const existing = this.runningRuns.get(sessionKey);
        if (existing) {
            existing.add(runId);
            return;
        }
        this.runningRuns.set(sessionKey, new Set([runId]));
    }
    removeSessionRun(sessionKey, runId) {
        const existing = this.runningRuns.get(sessionKey);
        if (!existing)
            return;
        existing.delete(runId);
        if (existing.size === 0) {
            this.runningRuns.delete(sessionKey);
        }
    }
    recordOutgoingMessageRef(params) {
        const run = getRootRun(params.runId);
        if (!run)
            return;
        insertChannelMessageRef({
            source: "telegram",
            session_id: params.sessionId,
            root_run_id: params.runId,
            request_group_id: run.requestGroupId,
            external_chat_id: String(params.chatId),
            external_thread_id: params.threadId != null ? String(params.threadId) : null,
            external_message_id: String(params.messageId),
            role: params.role,
            created_at: Date.now(),
        });
    }
    _registerHandlers() {
        this.bot.on("message", async (ctx) => {
            const chat = ctx.chat;
            const from = ctx.from;
            const message = ctx.message;
            if (!from)
                return;
            const userId = from.id;
            const chatId = chat.id;
            const chatType = chat.type;
            const threadId = message.message_thread_id ?? message.reply_to_message?.message_thread_id;
            const replyToMessageId = message.reply_to_message?.message_id;
            const access = evaluateInboundAccessPolicy({
                envelope: buildTelegramContinuationEnvelope({
                    chatId,
                    chatType,
                    messageId: message.message_id,
                    ...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
                    ...(threadId !== undefined ? { threadId } : {}),
                    userId,
                    text: message.text ?? message.caption ?? "",
                }),
                policy: buildAccessPolicyFromAllowedIds({
                    provider: "telegram",
                    allowedUserIds: this.config.allowedUserIds,
                    allowedRoomIds: telegramAllowedRoomIdsForChatType(chatType, this.config.allowedGroupIds),
                    requireAllowedPrincipal: true,
                    allowUnlisted: false,
                    emptyAllowlistAllows: false,
                }),
            });
            recordChannelAccessPolicyResult(access);
            if (!access.allowed) {
                log.warn(`Rejected user=${userId} chat=${chatId} type=${chatType} reason=${access.policy.reasonCode}`);
                return;
            }
            const sessionKey = resolveSessionKey(chatId, threadId);
            const activeSessionStatus = this.getSessionStatus(sessionKey);
            if (activeSessionStatus.running && replyToMessageId === undefined) {
                log.info(`Session ${sessionKey} already running; accepting message as a new independent run`);
            }
            // Determine message text and handle file attachments
            let text = message.text ?? "";
            if (message.document !== undefined) {
                const doc = message.document;
                const fileId = doc.file_id;
                const filename = doc.file_name ?? `file_${Date.now()}`;
                const sessionId = getOrCreateTelegramSession(sessionKey);
                try {
                    const localPath = await this.fileHandler.downloadFile(fileId, sessionId, filename);
                    const prefix = `[첨부파일: ${localPath}]\n`;
                    text = prefix + (message.caption ?? "");
                }
                catch (err) {
                    const msg = telegramBotErrorMessage(err);
                    const notice = buildTelegramAttachmentDownloadFailureNotice({
                        attachmentKind: "document",
                        language: resolveTelegramAttachmentFailureLanguage(message.caption, ctx.from?.language_code),
                        reason: msg,
                    });
                    log.error(`Failed to download document: ${msg}`);
                    await replyTelegramAttachmentFailureNotice({
                        reply: (text) => ctx.reply(text),
                        originalRequest: telegramAttachmentFailureOriginalRequest(message.caption, "document"),
                        rawText: notice.text,
                        dependencies: this.noticeRendering,
                    });
                    return;
                }
            }
            else if (message.photo !== undefined && message.photo.length > 0) {
                // Pick largest photo (last element)
                const photos = message.photo;
                let largest = photos[0];
                for (const photo of photos) {
                    const photoSize = photo.file_size ?? 0;
                    const largestSize = largest?.file_size ?? 0;
                    if (largest === undefined || photoSize > largestSize) {
                        largest = photo;
                    }
                }
                if (largest !== undefined) {
                    const sessionId = getOrCreateTelegramSession(sessionKey);
                    const filename = `photo_${Date.now()}.jpg`;
                    try {
                        const localPath = await this.fileHandler.downloadFile(largest.file_id, sessionId, filename);
                        const prefix = `[첨부파일: ${localPath}]\n`;
                        text = prefix + (message.caption ?? "");
                    }
                    catch (err) {
                        const msg = telegramBotErrorMessage(err);
                        const notice = buildTelegramAttachmentDownloadFailureNotice({
                            attachmentKind: "photo",
                            language: resolveTelegramAttachmentFailureLanguage(message.caption, ctx.from?.language_code),
                            reason: msg,
                        });
                        log.error(`Failed to download photo: ${msg}`);
                        await replyTelegramAttachmentFailureNotice({
                            reply: (text) => ctx.reply(text),
                            originalRequest: telegramAttachmentFailureOriginalRequest(message.caption, "photo"),
                            rawText: notice.text,
                            dependencies: this.noticeRendering,
                        });
                        return;
                    }
                }
            }
            if (!text.trim())
                return;
            const sessionId = getOrCreateTelegramSession(sessionKey);
            this.sessionIds.set(sessionKey, sessionId);
            eventBus.emit("message.inbound", {
                source: "telegram",
                sessionId,
                content: text,
                userId: String(userId),
            });
            const language = resolveTelegramInboundMessageLanguage(text);
            setActiveChatForSession(sessionId, chatId, userId, threadId, language);
            const responder = new TelegramResponder(this.bot, chatId, threadId, language);
            const typing = new TypingIndicator(async () => {
                await ctx.replyWithChatAction("typing");
            });
            typing.start();
            let startedRunId = "";
            const continuation = resolveChannelContinuation({
                envelope: access.envelope,
                language,
            });
            if (continuation.status === "ambiguous") {
                typing.stop();
                const confirmationText = continuation.confirmationNotice?.text ?? continuation.confirmationPrompt;
                if (confirmationText?.trim()) {
                    await sendTelegramContinuationConfirmation({
                        responder,
                        originalRequest: text,
                        rawText: confirmationText,
                        dependencies: this.noticeRendering,
                    });
                }
                clearActiveChatForSession(sessionId);
                return;
            }
            const repliedTaskRef = continuation.selected
                ? {
                    root_run_id: continuation.selected.runId,
                    request_group_id: continuation.selected.requestGroupId,
                }
                : undefined;
            try {
                if (repliedTaskRef) {
                    const cancelled = cancelRootRun(repliedTaskRef.root_run_id);
                    if (cancelled) {
                        log.info(`Reply override detected for requestGroup=${repliedTaskRef.request_group_id}; previous active action cancelled before starting new reply run`);
                    }
                }
                const onChunk = createTelegramChunkDeliveryHandler({
                    artifactStorage: this.artifactStorage,
                    responder,
                    sessionId,
                    chatId,
                    language,
                    ...(threadId !== undefined ? { threadId } : {}),
                    getRunId: () => startedRunId || undefined,
                    recordOutgoingMessageRef: (params) => this.recordOutgoingMessageRef(params),
                    logError: (message) => log.error(message),
                    noticeRendering: this.noticeRendering,
                });
                const runtimeConfig = this.noticeRendering?.config;
                if (!runtimeConfig)
                    throw new Error("Telegram root run config snapshot is missing.");
                if (!this.memoryJournal)
                    throw new Error("Telegram memory journal context is missing.");
                if (!this.hierarchyStorage)
                    throw new Error("Telegram hierarchy storage context is missing.");
                const { started, acknowledgement } = submitUserRequest({
                    artifactStorage: this.artifactStorage,
                    memoryJournal: this.memoryJournal,
                    hierarchyStorage: this.hierarchyStorage,
                    config: runtimeConfig,
                    message: text,
                    sessionId,
                    ...(repliedTaskRef
                        ? { requestGroupId: repliedTaskRef.request_group_id, forceRequestGroupReuse: true }
                        : {}),
                    model: undefined,
                    transport: {
                        source: "telegram",
                        channelEventId: `${chatId}:${threadId ?? "main"}:${message.message_id}`,
                        externalChatId: chatId,
                        externalThreadId: threadId,
                        externalMessageId: message.message_id,
                        userId,
                    },
                    onChunk,
                });
                startedRunId = started.runId;
                this.addSessionRun(sessionKey, started.runId);
                this.liveSmokeStartObservers.get(`${chatId}:${threadId ?? "main"}:${message.message_id}`)?.({
                    requestId: started.runId,
                    runId: started.runId,
                    requestGroupId: getRootRun(started.runId)?.requestGroupId ?? started.runId,
                    finished: started.finished,
                });
                {
                    const receiptMessageId = await sendTelegramIngressReceipt({
                        responder,
                        control: acknowledgement,
                    });
                    if (receiptMessageId !== undefined) {
                        const startedRun = getRootRun(startedRunId);
                        recordMessageLedgerEvent({
                            runId: startedRunId,
                            requestGroupId: startedRun?.requestGroupId ?? startedRunId,
                            sessionKey: sessionId,
                            threadKey: sessionKey,
                            channel: "telegram",
                            eventKind: "fast_receipt_sent",
                            deliveryKey: `telegram:receipt:${chatId}:${threadId ?? "main"}:${receiptMessageId}`,
                            idempotencyKey: `telegram:receipt:${startedRunId}:${receiptMessageId}`,
                            status: "sent",
                            summary: "Telegram 접수 메시지를 전송했습니다.",
                            detail: {
                                acknowledgementControl: acknowledgement,
                                chatId: String(chatId),
                                ...(threadId !== undefined ? { threadId } : {}),
                                messageId: receiptMessageId,
                            },
                        });
                        this.recordOutgoingMessageRef({
                            sessionId,
                            runId: startedRunId,
                            chatId,
                            ...(threadId !== undefined ? { threadId } : {}),
                            messageId: receiptMessageId,
                            role: "assistant",
                        });
                    }
                }
                typing.stop();
                void started.finished.finally(() => {
                    this.removeSessionRun(sessionKey, startedRunId);
                    clearActiveChatForSession(sessionId);
                });
                return;
            }
            catch (err) {
                const message = telegramBotErrorMessage(err);
                const notice = buildChannelIngressFailureNotice({
                    provider: "telegram",
                    userMessage: text,
                    reason: message,
                });
                log.error(`Error handling message: ${message}`);
                const renderedNotice = await renderChannelNoticeText({
                    originalRequest: text,
                    rawText: notice.text,
                    ...(this.noticeRendering ? { dependencies: this.noticeRendering } : {}),
                });
                if (renderedNotice.status === "ready") {
                    await responder.sendError(renderedNotice.text).catch(() => undefined);
                }
                else {
                    log.warn(`Skipped Telegram ingress failure notice delivery: ${renderedNotice.reason}`);
                }
            }
            finally {
                if (!startedRunId) {
                    typing.stop();
                    clearActiveChatForSession(sessionId);
                }
            }
        });
        registerCommands(this.bot, this, this.noticeRendering);
        registerApprovalHandler(this.bot);
        this.bot.catch((err) => {
            log.error(`grammy error: ${telegramBotErrorMessage(err)}`);
        });
    }
    async start() {
        log.info("Starting Telegram bot (Long Polling)...");
        await this.bot.api.setMyCommands([
            { command: "start", description: "환영 메시지 및 사용법 보기" },
            { command: "new", description: "새 대화 세션 시작 (기록 초기화)" },
            { command: "cancel", description: "현재 실행 중인 작업 취소" },
            { command: "status", description: "세션 상태 확인" },
            { command: "help", description: "전체 명령어 설명" },
        ]);
        if (this.bot.isRunning())
            return;
        let startupSettled = false;
        await new Promise((resolve, reject) => {
            const pollingTask = this.bot.start({
                onStart: () => {
                    startupSettled = true;
                    setTelegramRuntimeError(null);
                    eventBus.emit("channel.connected", {
                        channel: "telegram",
                        detail: { transport: "long_polling" },
                    });
                    resolve();
                },
            });
            this.pollingTask = pollingTask
                .catch((err) => {
                const message = telegramBotErrorMessage(err);
                setTelegramRuntimeError(message);
                if (!startupSettled) {
                    reject(err);
                    return;
                }
                log.error(`Telegram polling stopped: ${message}`);
            })
                .finally(() => {
                this.pollingTask = null;
            });
        });
    }
    stop() {
        log.info("Stopping Telegram bot...");
        void this.bot.stop();
        this.pollingTask = null;
    }
    async sendTextToSession(sessionId, text) {
        const session = getSession(sessionId);
        if (!session || session.source !== "telegram" || !session.source_id) {
            throw new Error(`Telegram session ${sessionId} not found`);
        }
        const target = parseTelegramSessionKey(session.source_id);
        if (!target) {
            throw new Error(`Telegram session ${sessionId} has invalid source_id`);
        }
        const responder = new TelegramResponder(this.bot, target.chatId, target.threadId);
        return responder.sendFinalResponse(text);
    }
    async sendFileToSession(sessionId, filePath, caption) {
        const session = getSession(sessionId);
        if (!session || session.source !== "telegram" || !session.source_id) {
            throw new Error(`Telegram session ${sessionId} not found`);
        }
        const target = parseTelegramSessionKey(session.source_id);
        if (!target) {
            throw new Error(`Telegram session ${sessionId} has invalid source_id`);
        }
        const responder = new TelegramResponder(this.bot, target.chatId, target.threadId);
        return responder.sendFile(filePath, caption);
    }
}
//# sourceMappingURL=bot.js.map