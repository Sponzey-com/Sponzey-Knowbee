import { authMiddleware } from "../middleware/auth.js";
import { stopActiveSlackChannel } from "../../channels/slack/runtime.js";
import { stopActiveTelegramChannel } from "../../channels/telegram/runtime.js";
import { stopDiscordRuntime } from "../../channels/discord/runtime.js";
import { stopGoogleChatRuntime } from "../../channels/google-chat/runtime.js";
import { testMcpServerConnection, testSkillPath } from "../../control-plane/setup-extensions.js";
import { sanitizeUserFacingError } from "../../runs/error-sanitizer.js";
import { redactLogText } from "../../logger/index.js";
import { resolveAIConnection } from "../../ai/index.js";
import { buildSetupDraft, completeSetup, createSetupChecks, createTransientAuthToken, discoverModelsFromEndpoint, readSetupState, redactSetupChecksForApi, redactSetupDraftSecrets, resetSetupEnvironment, saveSetupDraft, } from "../../control-plane/index.js";
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js";
const CHANNEL_TEST_SECRET_MASK = "***";
const SETUP_MCP_SECRET_MASK = "***";
const SETUP_MCP_PATH_MASK = "[internal-path-redacted]";
function redactChannelTestError(message, secrets, fallback) {
    let redacted = (message ?? "").trim() || fallback;
    for (const secret of secrets) {
        const value = secret?.trim();
        if (value)
            redacted = redacted.split(value).join(CHANNEL_TEST_SECRET_MASK);
    }
    redacted = redacted
        .replace(/bot\d+:[^\s"'`<>]+/gi, `bot${CHANNEL_TEST_SECRET_MASK}`)
        .replace(/\bxox[abprs]-[A-Za-z0-9-]{8,}\b/g, CHANNEL_TEST_SECRET_MASK)
        .replace(/\bxapp-[A-Za-z0-9-]{8,}\b/g, CHANNEL_TEST_SECRET_MASK)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${CHANNEL_TEST_SECRET_MASK}`);
    return redacted.length > 220 ? `${redacted.slice(0, 217)}...` : redacted;
}
function setupChannelTestExceptionMessage(error, secrets, fallback) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return redactChannelTestError(rawMessage, secrets, fallback);
}
function redactSkillPathTestResult(result) {
    return {
        ok: result.ok,
        message: result.message,
    };
}
function setupRouteErrorSummary(error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return sanitizeUserFacingError(redactLogText(rawMessage));
}
function redactSetupMcpTestMessage(message, server) {
    let redacted = (message ?? "").trim() || "MCP connection test failed.";
    for (const rawPath of [server.command, server.cwd, server.url]) {
        const value = rawPath?.trim();
        if (value)
            redacted = redacted.split(value).join(SETUP_MCP_PATH_MASK);
    }
    const args = server.argsText
        .split(/\n+/)
        .map((value) => value.trim())
        .filter(Boolean);
    for (const arg of args) {
        if (/(api[_-]?key|token|secret|password|credential|authorization|bearer)/i.test(arg)) {
            redacted = redacted.split(arg).join(SETUP_MCP_SECRET_MASK);
        }
    }
    redacted = redacted
        .replace(/((?:api[_-]?key|token|secret|password|credential|authorization)(?:["'\s:=]+))([^"'\s,}]+)/gi, `$1${SETUP_MCP_SECRET_MASK}`)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${SETUP_MCP_SECRET_MASK}`)
        .replace(/\/(?:private\/)?var\/folders\/[^\s"'`<>]+/gi, SETUP_MCP_PATH_MASK)
        .replace(/\/tmp\/[^\s"'`<>]+/gi, SETUP_MCP_PATH_MASK)
        .replace(/\/Users\/[^\s"'`<>]+/gi, SETUP_MCP_PATH_MASK)
        .replace(/[A-Z]:\\[^\s"'`<>]+/gi, SETUP_MCP_PATH_MASK);
    return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}
function redactSetupMcpTestResult(result, server) {
    if (result.ok)
        return result;
    return {
        ok: false,
        message: redactSetupMcpTestMessage(result.message, server),
        tools: [],
    };
}
export function registerSetupRoute(app, options = {}) {
    app.get("/api/setup/status", { preHandler: authMiddleware }, async (req) => {
        return readSetupState(getApiRuntimePaths(req));
    });
    app.get("/api/setup/checks", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        return redactSetupChecksForApi(createSetupChecks(config, getApiRuntimePaths(req)));
    });
    app.get("/api/setup/draft", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        return redactSetupDraftSecrets(buildSetupDraft(config, getApiRuntimePaths(req)));
    });
    app.put("/api/setup/draft", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        const saved = saveSetupDraft(req.body.draft, req.body.state, config, getApiRuntimePaths(req));
        return {
            ...saved,
            draft: redactSetupDraftSecrets(saved.draft),
            restartRequired: true,
            appliesOn: "next_start",
        };
    });
    app.post("/api/setup/test-backend", { preHandler: authMiddleware }, async (req, reply) => {
        const endpoint = req.body?.endpoint?.trim();
        const providerType = ["openai", "ollama", "llama", "anthropic", "gemini", "custom"].includes(String(req.body?.providerType))
            ? req.body?.providerType
            : "custom";
        const authMode = ["api_key", "chatgpt_oauth"].includes(String(req.body?.authMode))
            ? req.body?.authMode
            : "api_key";
        const credentials = {};
        if (req.body?.credentials?.apiKey?.trim())
            credentials.apiKey = req.body.credentials.apiKey.trim();
        if (req.body?.credentials?.username?.trim())
            credentials.username = req.body.credentials.username.trim();
        if (req.body?.credentials?.password?.trim())
            credentials.password = req.body.credentials.password.trim();
        if (req.body?.credentials?.oauthAuthFilePath?.trim()) {
            credentials.oauthAuthFilePath = req.body.credentials.oauthAuthFilePath.trim();
        }
        if (!endpoint) {
            return reply.status(400).send({ ok: false, error: "endpoint is required" });
        }
        try {
            const config = getApiRuntimeConfig(req);
            const result = await discoverModelsFromEndpoint(endpoint, config, providerType, credentials, authMode);
            const providerResolution = resolveAIConnection({
                provider: providerType,
                model: result.models[0] ?? "",
                endpoint,
                auth: {
                    mode: authMode,
                    ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
                    ...(credentials.username ? { username: credentials.username } : {}),
                    ...(credentials.password ? { password: credentials.password } : {}),
                    ...(credentials.oauthAuthFilePath ? { oauthAuthFilePath: credentials.oauthAuthFilePath } : {}),
                },
            }).auditTrace;
            return { ok: true, ...result, providerResolution, capabilityMatrix: result.capabilityMatrix };
        }
        catch (error) {
            const sanitized = setupRouteErrorSummary(error);
            return reply.status(400).send({
                ok: false,
                error: sanitized.userMessage,
                kind: sanitized.kind,
                actionHint: sanitized.actionHint,
            });
        }
    });
    app.post("/api/setup/test-telegram", { preHandler: authMiddleware }, async (req, reply) => {
        const token = req.body?.botToken?.trim();
        if (!token) {
            return reply.status(400).send({ ok: false, message: "Bot token이 비어 있습니다." });
        }
        if (!token.includes(":")) {
            return reply.status(400).send({ ok: false, message: "Bot token 형식이 올바르지 않습니다." });
        }
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            const payload = await response.json();
            if (!response.ok || payload.ok !== true) {
                return reply.status(400).send({
                    ok: false,
                    message: redactChannelTestError(payload.description, [token], "Telegram API 연결에 실패했습니다."),
                });
            }
            const botName = payload.result?.username ?? payload.result?.first_name ?? "unknown";
            return {
                ok: true,
                message: `Telegram Bot 연결 성공: ${botName}`,
            };
        }
        catch (error) {
            return reply.status(400).send({
                ok: false,
                message: setupChannelTestExceptionMessage(error, [token], "Telegram API 연결에 실패했습니다."),
            });
        }
    });
    app.post("/api/setup/test-slack", { preHandler: authMiddleware }, async (req, reply) => {
        const botToken = req.body?.botToken?.trim();
        const appToken = req.body?.appToken?.trim();
        if (!botToken) {
            return reply.status(400).send({ ok: false, message: "Slack Bot Token이 비어 있습니다." });
        }
        if (!appToken) {
            return reply.status(400).send({ ok: false, message: "Slack App Token이 비어 있습니다." });
        }
        try {
            const authResponse = await fetch("https://slack.com/api/auth.test", {
                method: "POST",
                headers: { Authorization: `Bearer ${botToken}` },
            });
            const authPayload = await authResponse.json();
            if (!authResponse.ok || authPayload.ok !== true) {
                return reply.status(400).send({
                    ok: false,
                    message: redactChannelTestError(authPayload.error, [botToken, appToken], "Slack Bot Token 연결에 실패했습니다."),
                });
            }
            const socketResponse = await fetch("https://slack.com/api/apps.connections.open", {
                method: "POST",
                headers: { Authorization: `Bearer ${appToken}` },
            });
            const socketPayload = await socketResponse.json();
            if (!socketResponse.ok || socketPayload.ok !== true || !socketPayload.url) {
                return reply.status(400).send({
                    ok: false,
                    message: redactChannelTestError(socketPayload.error, [botToken, appToken], "Slack App Token 연결에 실패했습니다."),
                });
            }
            const label = authPayload.team || authPayload.user || "Slack";
            return {
                ok: true,
                message: `Slack 연결 성공: ${label}. 아직 반응이 없다면 Slack 앱에 Event Subscriptions(app_mention, message.im)과 Socket Mode가 켜져 있고, 봇이 대상 채널에 초대되었는지 확인해 주세요.`,
            };
        }
        catch (error) {
            return reply.status(400).send({
                ok: false,
                message: setupChannelTestExceptionMessage(error, [botToken, appToken], "Slack 연결 테스트에 실패했습니다."),
            });
        }
    });
    app.post("/api/setup/test-mcp-server", { preHandler: authMiddleware }, async (req, reply) => {
        const server = req.body?.server;
        if (!server || typeof server !== "object") {
            return reply.status(400).send({ ok: false, message: "MCP 서버 설정이 비어 있습니다.", tools: [] });
        }
        const result = redactSetupMcpTestResult(await testMcpServerConnection(server, getApiRuntimeConfig(req).profile.workspace, {
            ...(options.mcpProcessEnv ? { baseEnv: options.mcpProcessEnv } : {}),
        }), server);
        if (!result.ok) {
            return reply.status(400).send(result);
        }
        return result;
    });
    app.post("/api/setup/test-skill-path", { preHandler: authMiddleware }, async (req, reply) => {
        const result = testSkillPath(req.body?.path ?? "");
        const response = redactSkillPathTestResult(result);
        if (!result.ok) {
            return reply.status(400).send(response);
        }
        return response;
    });
    app.post("/api/setup/generate-auth-token", { preHandler: authMiddleware }, async () => {
        return { token: createTransientAuthToken() };
    });
    app.post("/api/setup/reset", { preHandler: authMiddleware }, async (req) => {
        stopActiveSlackChannel();
        stopActiveTelegramChannel();
        stopDiscordRuntime();
        stopGoogleChatRuntime();
        const snapshot = resetSetupEnvironment(getApiRuntimePaths(req));
        return {
            ...snapshot,
            draft: redactSetupDraftSecrets(snapshot.draft),
            checks: redactSetupChecksForApi(snapshot.checks),
            restartRequired: true,
            appliesOn: "next_start",
        };
    });
    app.post("/api/setup/complete", { preHandler: authMiddleware }, async (req) => {
        return completeSetup(getApiRuntimePaths(req));
    });
}
//# sourceMappingURL=setup.js.map