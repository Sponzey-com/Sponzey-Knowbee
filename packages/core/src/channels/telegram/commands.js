import { getDefaultModel, getProvider } from "../../ai/index.js";
import { buildFinalResponseIdentityContext, renderFinalResponseText as renderFinalResponseTextDefault, } from "../../runs/final-response-renderer.js";
import { authorizeUserFacingResponse } from "../../runs/user-facing-response-gate.js";
export function resolveTelegramCommandResponseLanguage(languageCode) {
    return languageCode?.toLowerCase().startsWith("ko") ? "ko" : "en";
}
export function buildTelegramCommandResponseNotice(command, language = "en") {
    return {
        kind: "telegram_command_response_notice",
        command,
        language,
        deliveryMode: "command_response",
        textSource: "telegram_command_control_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function commandResponse(input) {
    return {
        command: input.command,
        language: input.language,
        text: input.text,
        ...(input.parseMode ? { parseMode: input.parseMode } : {}),
        notice: buildTelegramCommandResponseNotice(input.command, input.language),
        textSource: "telegram_command_control_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
export function buildTelegramCommandResponse(input) {
    const language = input.language ?? "en";
    switch (input.command) {
        case "start": {
            const name = input.userFirstName?.trim() || (language === "ko" ? "사용자" : "there");
            return commandResponse({
                command: "start",
                language,
                text: language === "ko"
                    ? [
                        `${name}님, Telegram 채널이 연결되었습니다.`,
                        "",
                        "일반 요청은 메시지로 보내고, 채널 제어는 아래 명령을 사용하세요.",
                        "",
                        "사용 가능한 명령:",
                        "/start - 채널 안내 보기",
                        "/new - 새 대화 세션 시작",
                        "/cancel - 현재 실행 중인 작업 취소",
                        "/status - 현재 세션 상태 확인",
                        "/help - 전체 명령 보기",
                    ].join("\n")
                    : [
                        `Hello, ${name}.`,
                        "",
                        "Knowbee Telegram channel is connected.",
                        "Send a message to start a normal request, or use a command below.",
                        "",
                        "Available commands:",
                        "/start - Show this channel notice",
                        "/new - Start a new conversation session",
                        "/cancel - Cancel the current running task",
                        "/status - Show current session status",
                        "/help - Show all commands",
                    ].join("\n"),
            });
        }
        case "new":
            return commandResponse({
                command: "new",
                language,
                text: language === "ko"
                    ? "새 대화 세션을 시작했습니다. 이전 대화 기록은 이 세션에서 사용하지 않습니다."
                    : "New session started. Previous conversation history has been cleared.",
            });
        case "cancel":
            return commandResponse({
                command: "cancel",
                language,
                text: input.aborted
                    ? language === "ko" ? "현재 실행 중인 작업을 취소했습니다." : "Current task has been cancelled."
                    : language === "ko" ? "현재 실행 중인 작업이 없습니다." : "No task is currently running.",
            });
        case "status": {
            const status = input.status ?? { sessionId: undefined, runId: undefined, running: false };
            return commandResponse({
                command: "status",
                language,
                parseMode: "Markdown",
                text: language === "ko"
                    ? [
                        "*세션 상태*",
                        "",
                        `세션 키: \`${input.sessionKey ?? "unknown"}\``,
                        `세션 ID: \`${status.sessionId ?? "none"}\``,
                        `실행 ID: \`${status.runId ?? "none"}\``,
                        `실행 중: ${status.running ? "예" : "아니오"}`,
                        `활성 작업: ${input.runningCount ?? 0}`,
                    ].join("\n")
                    : [
                        "*Session Status*",
                        "",
                        `Session Key: \`${input.sessionKey ?? "unknown"}\``,
                        `Session ID: \`${status.sessionId ?? "none"}\``,
                        `Run ID: \`${status.runId ?? "none"}\``,
                        `Running: ${status.running ? "Yes" : "No"}`,
                        `Active Tasks: ${input.runningCount ?? 0}`,
                    ].join("\n"),
            });
        }
        case "help":
            return commandResponse({
                command: "help",
                language,
                parseMode: "Markdown",
                text: language === "ko"
                    ? [
                        "*Telegram 명령*",
                        "",
                        "/start - 채널 안내와 사용법 보기",
                        "/new - 새 세션 시작",
                        "/cancel - 현재 실행 중인 작업 취소",
                        "/status - 세션 ID와 실행 상태 확인",
                        "/help - 명령 목록 보기",
                        "",
                        "일반 요청은 텍스트 메시지로 보내세요.",
                    ].join("\n")
                    : [
                        "*Knowbee Telegram Commands*",
                        "",
                        "/start - Show channel notice and usage",
                        "/new - Start a new session and clear history",
                        "/cancel - Cancel the currently running task",
                        "/status - Show session ID and running status",
                        "/help - Show this command list",
                        "",
                        "Send a normal text message to create a request.",
                    ].join("\n"),
            });
    }
}
function commandOriginalRequest(response) {
    return response.language === "ko"
        ? `Telegram 명령 /${response.command}`
        : `Telegram command /${response.command}`;
}
export async function resolveTelegramCommandReply(response, dependencies = {}) {
    const originalRequest = commandOriginalRequest(response);
    const config = dependencies.config;
    if (!config)
        return { status: "blocked", reason: "telegram_command_reply_config_missing" };
    const workDir = dependencies.workDir?.trim() || config?.profile.workspace.trim();
    if (!workDir)
        return { status: "blocked", reason: "telegram_command_reply_work_dir_missing" };
    const identityContext = dependencies.identityContext
        ?? (config
            ? buildFinalResponseIdentityContext({
                config,
                originalRequest,
                workDir,
            })
            : undefined);
    if (!identityContext)
        return { status: "blocked", reason: "telegram_command_reply_identity_context_missing" };
    const model = dependencies.getDefaultModel?.() ?? (config ? getDefaultModel(config) : "");
    if (!model.trim())
        return { status: "blocked", reason: "telegram_command_reply_model_missing" };
    let provider;
    if (!dependencies.renderFinalResponseText) {
        try {
            provider = dependencies.getProvider?.() ?? (config ? getProvider(undefined, config) : undefined);
        }
        catch {
            return { status: "blocked", reason: "telegram_command_reply_provider_missing" };
        }
    }
    const render = dependencies.renderFinalResponseText ?? renderFinalResponseTextDefault;
    let rendered;
    try {
        rendered = await render({
            originalRequest,
            rawText: response.text,
            textSource: "runtime_deterministic",
            model,
            ...(provider ? { provider } : {}),
            config,
            workDir,
            identityContext,
        });
    }
    catch {
        rendered = null;
    }
    const text = rendered?.text.trim();
    if (!text)
        return { status: "blocked", reason: "telegram_command_reply_render_failed" };
    const authorization = authorizeUserFacingResponse({
        rawText: response.text,
        responseText: text,
        rawTextSource: "runtime_deterministic",
        contentKind: "fixed_notice",
        expectedLanguage: identityContext.promptLocale,
        receipt: rendered?.reviewReceipt,
    });
    if (!authorization.ok) {
        return {
            status: "blocked",
            reason: `telegram_command_reply_${authorization.reasonCode ?? "review_receipt_missing"}`,
        };
    }
    return {
        status: "ready",
        text,
        ...(response.parseMode ? { parseMode: response.parseMode } : {}),
        textSource: "llm_reviewed",
    };
}
export async function replyTelegramCommandResponse(ctx, response, dependencies = {}) {
    const resolution = await resolveTelegramCommandReply(response, dependencies);
    if (resolution.status === "blocked")
        return;
    if (resolution.parseMode) {
        await ctx.reply(resolution.text, { parse_mode: resolution.parseMode });
        return;
    }
    await ctx.reply(resolution.text);
}
export function registerCommands(bot, channel, dependencies = {}) {
    bot.command("start", async (ctx) => {
        await replyTelegramCommandResponse(ctx, buildTelegramCommandResponse({
            command: "start",
            language: resolveTelegramCommandResponseLanguage(ctx.from?.language_code),
            userFirstName: ctx.from?.first_name,
        }), dependencies);
    });
    bot.command("new", async (ctx) => {
        const chat = ctx.chat;
        const message = ctx.message;
        const threadId = message?.message_thread_id;
        const sessionKey = channel.getSessionKey(chat.id, threadId);
        channel.newSession(sessionKey);
        await replyTelegramCommandResponse(ctx, buildTelegramCommandResponse({
            command: "new",
            language: resolveTelegramCommandResponseLanguage(ctx.from?.language_code),
        }), dependencies);
    });
    bot.command("cancel", async (ctx) => {
        const chat = ctx.chat;
        const message = ctx.message;
        const threadId = message?.message_thread_id;
        const sessionKey = channel.getSessionKey(chat.id, threadId);
        const aborted = channel.abortSession(sessionKey);
        await replyTelegramCommandResponse(ctx, buildTelegramCommandResponse({
            command: "cancel",
            language: resolveTelegramCommandResponseLanguage(ctx.from?.language_code),
            aborted,
        }), dependencies);
    });
    bot.command("status", async (ctx) => {
        const chat = ctx.chat;
        const message = ctx.message;
        const threadId = message?.message_thread_id;
        const sessionKey = channel.getSessionKey(chat.id, threadId);
        const status = channel.getSessionStatus(sessionKey);
        await replyTelegramCommandResponse(ctx, buildTelegramCommandResponse({
            command: "status",
            language: resolveTelegramCommandResponseLanguage(ctx.from?.language_code),
            sessionKey,
            status,
            runningCount: channel.getRunningCount(),
        }), dependencies);
    });
    bot.command("help", async (ctx) => {
        await replyTelegramCommandResponse(ctx, buildTelegramCommandResponse({
            command: "help",
            language: resolveTelegramCommandResponseLanguage(ctx.from?.language_code),
        }), dependencies);
    });
}
//# sourceMappingURL=commands.js.map