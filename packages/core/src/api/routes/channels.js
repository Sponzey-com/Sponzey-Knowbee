import crypto from "node:crypto";
import { createArtifactStorageContext } from "../../artifacts/lifecycle.js";
import { TelegramChannel, buildSettingsChannelConnectionSnapshot, DiscordChannelAdapter, buildDiscordPermissionDoctor, GoogleChatChannelAdapter, buildGoogleChatWorkspaceDoctor, createStartedChannelRecoveryRuntime, defineChannelCapabilities, recordChannelRuntimeEvent, } from "../../channels/index.js";
import { buildIMessageCapabilityManifest, buildIMessageLocalBridgeDoctor, } from "../../channels/imessage/adapter.js";
import { buildKakaoTalkLocalBridgeCapabilityManifest, buildKakaoTalkLocalBridgeDoctor, buildKakaoTalkOfficialCapabilityManifest, buildKakaoTalkOfficialDoctor, } from "../../channels/kakaotalk/adapter.js";
import { SlackChannel } from "../../channels/slack/bot.js";
import { getActiveSlackChannel, getSlackRuntimeStatus, setActiveSlackChannel, setSlackRuntimeError, stopActiveSlackChannel, } from "../../channels/slack/runtime.js";
import { getActiveTelegramChannel, getTelegramRuntimeStatus, setActiveTelegramChannel, setTelegramRuntimeError, stopActiveTelegramChannel, } from "../../channels/telegram/runtime.js";
import { getDiscordRuntimeStatus, setDiscordRuntimeError, stopDiscordRuntime, } from "../../channels/discord/runtime.js";
import { getGoogleChatRuntimeStatus, setGoogleChatRuntimeError, stopGoogleChatRuntime, } from "../../channels/google-chat/runtime.js";
import { DEFAULT_CONFIG, } from "../../config/types.js";
import { readPersistedRawConfig, writePersistedRawConfig } from "../../config/persisted-file.js";
import { redactLogText } from "../../logger/index.js";
import { buildPersistedConfigurationCommand, buildPersistedRuntimeAppliedConfigurationCommand, buildRejectedConfigurationCommand, buildRuntimeAppliedConfigurationCommand, buildRuntimeFailedConfigurationCommand, } from "../../config/command-state.js";
import { getDb, listMessageLedgerEvents, } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { getApprovalRegistryRow, resolveApprovalRegistryDecision } from "../../runs/approval-registry.js";
import { recordMessageLedgerEvent } from "../../runs/message-ledger.js";
import { resolveRegisteredWebUiApproval } from "../ws/stream.js";
import { getRuntimeBuildStatus } from "../../runtime/build-status.js";
import { authMiddleware } from "../middleware/auth.js";
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js";
import { activateChannelsAndRecoverPendingResponses, recoverPendingResponsesForChannelRuntime, } from "../../runtime/channel-activation-recovery.js";
const defaultChannelsRouteDependencies = {
    resolveRegisteredWebUiApproval,
};
const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|credential|authorization|cookie|raw[_-]?(?:body|payload|response)|signature)/i;
const CHANNEL_ERROR_SECRET_MASK = "***";
const CHANNEL_ERROR_PATH_MASK = "[internal-path-redacted]";
const FINAL_DELIVERY_EVENT_KINDS = new Set([
    "delivery_finalized",
    "final_answer_delivered",
    "final_answer_suppressed",
    "text_delivery_suppressed",
    "artifact_delivered",
]);
const TERMINAL_DELIVERY_STATUSES = new Set(["delivered", "succeeded", "suppressed"]);
const LOCAL_BRIDGE_PROVIDERS = new Set(["imessage", "kakaotalk"]);
const IMESSAGE_LOCAL_CONNECTION_ID = "imessage:local";
const KAKAOTALK_OFFICIAL_CONNECTION_ID = "kakaotalk:official";
const KAKAOTALK_LOCAL_CONNECTION_ID = "kakaotalk:local";
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseLimit(value, fallback = 100, max = 1000) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.floor(parsed), max);
}
function safeParseJson(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function redactValue(value, depth = 0) {
    if (value == null)
        return value;
    if (depth > 8)
        return "[truncated]";
    if (typeof value === "string") {
        return value.length > 1000 ? `${value.slice(0, 1000)}...[truncated]` : value;
    }
    if (Array.isArray(value))
        return value.slice(0, 100).map((item) => redactValue(item, depth + 1));
    if (!isRecord(value))
        return value;
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
        result[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactValue(nested, depth + 1);
    }
    return result;
}
function collectChannelSecrets(config) {
    return [
        config.telegram?.botToken,
        config.slack?.botToken,
        config.slack?.appToken,
        config.discord?.botToken,
        config.discord?.publicKey,
        config.googleChat?.appCredentialJson,
        config.googleChat?.verificationToken,
        config.googleChat?.webhookUrl,
        config.kakaoTalk?.businessApiKey,
    ].map((value) => value?.trim()).filter((value) => Boolean(value));
}
function redactChannelErrorMessage(config, paths, message, fallback = "Channel runtime operation failed.") {
    let redacted = (message ?? "").trim() || fallback;
    for (const secret of collectChannelSecrets(config)) {
        redacted = redacted.split(secret).join(CHANNEL_ERROR_SECRET_MASK);
    }
    for (const path of [paths.stateDir, paths.configFile, paths.dbFile, paths.setupStateFile]) {
        if (path)
            redacted = redacted.split(path).join(CHANNEL_ERROR_PATH_MASK);
    }
    redacted = redacted
        .replace(/bot\d+:[^\s"'`<>]+/gi, `bot${CHANNEL_ERROR_SECRET_MASK}`)
        .replace(/\bxox[abprs]-[A-Za-z0-9-]{8,}\b/g, CHANNEL_ERROR_SECRET_MASK)
        .replace(/\bxapp-[A-Za-z0-9-]{8,}\b/g, CHANNEL_ERROR_SECRET_MASK)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${CHANNEL_ERROR_SECRET_MASK}`);
    const safelyRedacted = redactLogText(redacted);
    return safelyRedacted.length > 240 ? `${safelyRedacted.slice(0, 237)}...` : safelyRedacted;
}
function channelRouteRuntimeErrorMessage(error, config, paths, fallback) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return redactChannelErrorMessage(config, paths, rawMessage, fallback);
}
function rawConfigKeyForProvider(provider) {
    return provider === "google_chat" ? "googleChat" : provider;
}
function ensureRawSection(raw, key) {
    if (!isRecord(raw[key]))
        raw[key] = {};
    return raw[key];
}
function updateRawChannelEnabled(provider, enabled, current, paths) {
    const raw = readPersistedRawConfig(paths);
    const section = ensureRawSection(raw, rawConfigKeyForProvider(provider));
    section.enabled = enabled;
    if (provider === "telegram" && !section.botToken && current.telegram?.botToken) {
        section.botToken = current.telegram.botToken;
    }
    if (provider === "slack") {
        if (!section.botToken && current.slack?.botToken)
            section.botToken = current.slack.botToken;
        if (!section.appToken && current.slack?.appToken)
            section.appToken = current.slack.appToken;
    }
    if (provider === "discord") {
        if (!section.botToken && current.discord?.botToken)
            section.botToken = current.discord.botToken;
        if (!section.applicationId && current.discord?.applicationId)
            section.applicationId = current.discord.applicationId;
        if (!section.publicKey && current.discord?.publicKey)
            section.publicKey = current.discord.publicKey;
    }
    if (provider === "google_chat") {
        if (!section.projectId && current.googleChat?.projectId)
            section.projectId = current.googleChat.projectId;
        if (!section.appCredentialJson && current.googleChat?.appCredentialJson)
            section.appCredentialJson = current.googleChat.appCredentialJson;
        if (!section.serviceAccountEmail && current.googleChat?.serviceAccountEmail)
            section.serviceAccountEmail = current.googleChat.serviceAccountEmail;
        if (!section.webhookUrl && current.googleChat?.webhookUrl)
            section.webhookUrl = current.googleChat.webhookUrl;
        if (!section.verificationToken && current.googleChat?.verificationToken)
            section.verificationToken = current.googleChat.verificationToken;
    }
    writePersistedRawConfig(raw, paths);
    const configKey = rawConfigKeyForProvider(provider);
    const updatedConfig = {
        ...current,
        [configKey]: {
            ...(current[configKey] ?? {}),
            enabled,
        },
    };
    const connection = requireConnection(`${provider}:primary`, updatedConfig);
    recordRuntime(connection, enabled ? "enabled" : "disabled", enabled ? "Channel enabled." : "Channel disabled.");
    return { connection, config: updatedConfig };
}
function updateRawLocalBridgeEnabled(connection, enabled, acknowledgeRisk, current, paths) {
    const raw = readPersistedRawConfig(paths);
    if (connection.connectionId === IMESSAGE_LOCAL_CONNECTION_ID) {
        const section = isRecord(raw.imessage) ? raw.imessage : {};
        section.enabled = enabled;
        if (enabled) {
            section.mode = section.mode === "outgoing_only" ? "outgoing_only" : "manual_confirm";
            if (acknowledgeRisk)
                section.riskAcknowledged = true;
            if (typeof section.manualConfirmationRequired !== "boolean")
                section.manualConfirmationRequired = true;
        }
        raw.imessage = section;
    }
    else if (connection.connectionId === KAKAOTALK_LOCAL_CONNECTION_ID) {
        const section = isRecord(raw.kakaoTalk) ? raw.kakaoTalk : {};
        section.enabled = enabled;
        if (enabled) {
            section.mode = "local_bridge";
            if (acknowledgeRisk)
                section.riskAcknowledged = true;
            if (typeof section.manualConfirmationRequired !== "boolean")
                section.manualConfirmationRequired = true;
        }
        raw.kakaoTalk = section;
    }
    else {
        throw new Error(`Unsupported local bridge connection: ${connection.connectionId}`);
    }
    writePersistedRawConfig(raw, paths);
    let updatedConfig;
    if (connection.connectionId === IMESSAGE_LOCAL_CONNECTION_ID) {
        const base = (current.imessage ?? DEFAULT_CONFIG.imessage);
        updatedConfig = {
            ...current,
            imessage: {
                ...base,
                enabled,
                ...(enabled
                    ? {
                        mode: base.mode === "outgoing_only" ? "outgoing_only" : "manual_confirm",
                        ...(acknowledgeRisk ? { riskAcknowledged: true } : {}),
                        manualConfirmationRequired: base.manualConfirmationRequired,
                    }
                    : {}),
            },
        };
    }
    else {
        const base = (current.kakaoTalk ?? DEFAULT_CONFIG.kakaoTalk);
        updatedConfig = {
            ...current,
            kakaoTalk: {
                ...base,
                enabled,
                ...(enabled
                    ? {
                        mode: "local_bridge",
                        ...(acknowledgeRisk ? { riskAcknowledged: true } : {}),
                        manualConfirmationRequired: base.manualConfirmationRequired,
                    }
                    : {}),
            },
        };
    }
    const updated = requireConnection(connection.connectionId, updatedConfig);
    recordRuntime(updated, enabled ? "enabled" : "disabled", enabled ? "Local bridge channel enabled." : "Local bridge channel disabled.", {
        providerRuntime: "not_started",
        classification: "channel_state",
    });
    return { connection: updated, config: updatedConfig };
}
function buildRuntimeSnapshot() {
    return {
        telegram: getTelegramRuntimeStatus(),
        slack: getSlackRuntimeStatus(),
        discord: getDiscordRuntimeStatus(),
        googleChat: getGoogleChatRuntimeStatus(),
    };
}
function listConnections(config) {
    const connections = buildSettingsChannelConnectionSnapshot({
        config,
        runtime: buildRuntimeSnapshot(),
        persist: true,
    });
    const knownFutureConnections = [
        IMESSAGE_LOCAL_CONNECTION_ID,
        KAKAOTALK_OFFICIAL_CONNECTION_ID,
        KAKAOTALK_LOCAL_CONNECTION_ID,
    ];
    for (const connectionId of knownFutureConnections) {
        if (connections.some((connection) => connection.connectionId === connectionId))
            continue;
        const fallback = buildKnownFutureConnection(connectionId, Date.now(), config);
        if (fallback)
            connections.push(fallback);
    }
    return connections;
}
function buildAllowedPrincipals(provider, kind, ids) {
    return ids.map((id) => ({
        namespaceId: `${provider}:${kind}:${id}`,
        provider,
        kind,
        providerIdentityId: id,
    }));
}
function defaultDeliveryPolicy() {
    return {
        inbound: { requireAllowedPrincipal: true, allowUnlisted: false },
        outbound: { defaultThreadPolicy: "reuse_origin_thread", fallbackChannel: "webui" },
    };
}
function localBridgeHealth(enabled, configured, doctor, now) {
    const error = doctor.issues.find((issue) => issue.severity === "error");
    const warning = doctor.issues.find((issue) => issue.severity === "warning");
    return {
        status: error && enabled ? "failed" : warning && enabled && configured ? "degraded" : "stopped",
        message: error?.message ?? warning?.message ?? null,
        checkedAt: now,
    };
}
function buildKnownFutureConnection(channelId, now, config) {
    if (channelId === IMESSAGE_LOCAL_CONNECTION_ID) {
        const imessage = config.imessage;
        const enabled = imessage?.enabled === true;
        const configured = Boolean(imessage?.localBridgeEnabled === true
            && imessage?.riskAcknowledged === true
            && imessage?.messagesAppAvailable === true
            && imessage?.userSessionActive === true
            && imessage?.automationPermissionGranted === true
            && (imessage?.allowedRecipientIds.length ?? 0) > 0);
        const provider = "imessage";
        const capabilityManifest = buildIMessageCapabilityManifest(imessage);
        return {
            connectionId: IMESSAGE_LOCAL_CONNECTION_ID,
            provider,
            displayName: "iMessage Local Bridge",
            connectionMode: "local_bridge",
            enabled,
            configured,
            health: localBridgeHealth(enabled, configured, buildIMessageLocalBridgeDoctor(imessage), now),
            capabilityManifest,
            authSecretRefs: [],
            allowedUsers: buildAllowedPrincipals(provider, "user", imessage?.allowedRecipientIds ?? []),
            allowedRooms: [],
            defaultDeliveryPolicy: defaultDeliveryPolicy(),
            source: provider,
            configSource: "compat",
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
        };
    }
    if (channelId === KAKAOTALK_OFFICIAL_CONNECTION_ID) {
        const kakaoTalk = config.kakaoTalk;
        const enabled = kakaoTalk?.enabled === true && kakaoTalk?.mode === "official";
        const hasApiKey = Boolean(kakaoTalk?.businessApiKey?.trim());
        const hasChannelId = Boolean(kakaoTalk?.channelId?.trim());
        const configured = kakaoTalk?.businessApiEnabled === true && hasApiKey && hasChannelId;
        const provider = "kakaotalk";
        const doctor = buildKakaoTalkOfficialDoctor(kakaoTalk);
        const error = doctor.issues.find((issue) => issue.severity === "error");
        return {
            connectionId: KAKAOTALK_OFFICIAL_CONNECTION_ID,
            provider,
            displayName: "KakaoTalk Business",
            connectionMode: "webhook",
            enabled,
            configured,
            health: {
                status: error && enabled ? "failed" : "stopped",
                message: error?.message ?? null,
                checkedAt: now,
            },
            capabilityManifest: buildKakaoTalkOfficialCapabilityManifest(),
            authSecretRefs: [
                { key: "businessApiKey", ref: "config:kakaoTalk.businessApiKey", source: "config", present: hasApiKey, redacted: true },
                { key: "channelId", ref: "config:kakaoTalk.channelId", source: "config", present: hasChannelId, redacted: true },
            ],
            allowedUsers: buildAllowedPrincipals(provider, "user", kakaoTalk?.allowedUserIds ?? []),
            allowedRooms: buildAllowedPrincipals(provider, "room", kakaoTalk?.allowedRoomIds ?? []),
            defaultDeliveryPolicy: defaultDeliveryPolicy(),
            source: provider,
            configSource: "compat",
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
        };
    }
    if (channelId === KAKAOTALK_LOCAL_CONNECTION_ID) {
        const kakaoTalk = config.kakaoTalk;
        const enabled = kakaoTalk?.enabled === true && kakaoTalk?.mode === "local_bridge";
        const allowedIds = [...(kakaoTalk?.allowedUserIds ?? []), ...(kakaoTalk?.allowedRoomIds ?? [])];
        const configured = Boolean(kakaoTalk?.localBridgeEnabled === true
            && kakaoTalk?.riskAcknowledged === true
            && kakaoTalk?.kakaoTalkAppAvailable === true
            && kakaoTalk?.userSessionActive === true
            && kakaoTalk?.automationPermissionGranted === true
            && allowedIds.length > 0);
        const provider = "kakaotalk";
        const capabilityManifest = buildKakaoTalkLocalBridgeCapabilityManifest(kakaoTalk);
        return {
            connectionId: KAKAOTALK_LOCAL_CONNECTION_ID,
            provider,
            displayName: "KakaoTalk Local Bridge",
            connectionMode: "local_bridge",
            enabled,
            configured,
            health: localBridgeHealth(enabled, configured, buildKakaoTalkLocalBridgeDoctor(kakaoTalk), now),
            capabilityManifest,
            authSecretRefs: [],
            allowedUsers: buildAllowedPrincipals(provider, "user", kakaoTalk?.allowedUserIds ?? []),
            allowedRooms: buildAllowedPrincipals(provider, "room", kakaoTalk?.allowedRoomIds ?? []),
            defaultDeliveryPolicy: defaultDeliveryPolicy(),
            source: provider,
            configSource: "compat",
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
        };
    }
    return undefined;
}
function buildPlaceholderCapabilities(provider, connectionKind) {
    return defineChannelCapabilities({
        provider,
        connectionKind,
        supportsThreads: connectionKind === "webhook",
        supportsReplies: true,
        supportsEdits: false,
        supportsDeletes: false,
        supportsReactions: false,
        supportsButtons: connectionKind === "webhook",
        supportsModals: false,
        supportsFiles: true,
        supportsImages: true,
        supportsTypingIndicator: false,
        maxMessageLength: 4000,
        rateLimitPolicy: { strategy: "provider_default" },
        requiresWebhook: connectionKind === "webhook",
        requiresLocalBridge: connectionKind === "local_bridge",
        requiresUserSession: connectionKind === "local_bridge",
        manualConfirmationRequired: connectionKind === "local_bridge",
        riskLevel: connectionKind === "local_bridge" ? "high" : "medium",
        deliveryStates: {
            supportsAccepted: true,
            supportsSent: true,
            supportsDelivered: false,
            supportsReadReceipt: false,
        },
    });
}
function getPlaceholderConnection(channelId, config) {
    const provider = channelId.split(":")[0];
    if (!provider || !["imessage", "kakaotalk"].includes(provider))
        return undefined;
    const now = Date.now();
    const known = buildKnownFutureConnection(channelId, now, config);
    if (known)
        return known;
    const connectionKind = channelId === "kakaotalk:official" ? "webhook" : LOCAL_BRIDGE_PROVIDERS.has(provider) ? "local_bridge" : "webhook";
    return {
        connectionId: channelId.includes(":") ? channelId : `${provider}:primary`,
        provider,
        displayName: provider === "imessage"
            ? "iMessage"
            : provider === "kakaotalk"
                ? "KakaoTalk"
                : "Local Bridge",
        connectionMode: connectionKind,
        enabled: false,
        configured: false,
        health: {
            status: "stopped",
            message: "Provider is declared in the channel contract but is not configured in this runtime yet.",
            checkedAt: now,
        },
        capabilityManifest: buildPlaceholderCapabilities(provider, connectionKind),
        authSecretRefs: [],
        allowedUsers: [],
        allowedRooms: [],
        defaultDeliveryPolicy: {
            inbound: { requireAllowedPrincipal: true, allowUnlisted: false },
            outbound: { defaultThreadPolicy: "reuse_origin_thread", fallbackChannel: "webui" },
        },
        source: provider,
        configSource: "system",
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
    };
}
function findConnection(channelId, config) {
    return listConnections(config).find((connection) => connection.connectionId === channelId) ?? getPlaceholderConnection(channelId, config);
}
function requireConnection(channelId, config) {
    const connection = findConnection(channelId, config);
    if (!connection)
        throw new Error(`Unknown channel connection: ${channelId}`);
    return connection;
}
function runtimeBuildDiagnostic() {
    const status = getRuntimeBuildStatus();
    return {
        buildId: status.buildId,
        checkedAt: status.checkedAt,
        processStartedAt: status.processStartedAt,
        buildRequired: status.buildRequired,
        restartRequired: status.restartRequired,
        warnings: status.warnings,
    };
}
function providerRuntimeStatus(provider) {
    const runtimeBuild = runtimeBuildDiagnostic();
    if (provider === "telegram")
        return { ...getTelegramRuntimeStatus(), runtimeBuild };
    if (provider === "slack")
        return { ...getSlackRuntimeStatus(), runtimeBuild };
    if (provider === "discord")
        return { ...getDiscordRuntimeStatus(), runtimeBuild };
    if (provider === "google_chat")
        return { ...getGoogleChatRuntimeStatus(), runtimeBuild };
    return {
        isRunning: false,
        lastStartedAt: null,
        lastStoppedAt: null,
        lastError: null,
        lastErrorAt: null,
        runtimeBuild,
    };
}
function connectionValidation(connection, config) {
    const issues = [];
    if (connection.enabled && !connection.configured) {
        issues.push({
            code: "missing_required_credentials",
            severity: "error",
            message: "Enabled channel is missing required credentials.",
        });
    }
    if (connection.capabilityManifest.requiresWebhook) {
        issues.push({
            code: "webhook_boundary_adapter_required",
            severity: "warning",
            message: "Webhook providers must verify signature or service auth in the provider adapter boundary.",
        });
    }
    if (connection.capabilityManifest.requiresLocalBridge) {
        issues.push({
            code: "local_bridge_risk_ack_required",
            severity: "warning",
            message: "Local bridge providers require explicit user consent before enablement.",
        });
    }
    if (connection.provider === "imessage") {
        const doctor = buildIMessageLocalBridgeDoctor(config.imessage);
        for (const issue of doctor.issues) {
            issues.push({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
            });
        }
    }
    if (connection.provider === "kakaotalk" && connection.connectionId === KAKAOTALK_LOCAL_CONNECTION_ID) {
        const doctor = buildKakaoTalkLocalBridgeDoctor(config.kakaoTalk);
        for (const issue of doctor.issues) {
            issues.push({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
            });
        }
    }
    if (connection.provider === "kakaotalk" && connection.connectionId === "kakaotalk:official") {
        const doctor = buildKakaoTalkOfficialDoctor(config.kakaoTalk);
        for (const issue of doctor.issues) {
            issues.push({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
            });
        }
    }
    const runtime = providerRuntimeStatus(connection.provider);
    const runtimeBuild = runtime.runtimeBuild;
    if (runtimeBuild?.buildRequired) {
        issues.push({
            code: "runtime_build_required",
            severity: "warning",
            message: "Source files are newer than dist. Build the workspace before relying on this channel runtime.",
        });
    }
    if (runtimeBuild?.restartRequired) {
        issues.push({
            code: "runtime_restart_required",
            severity: "warning",
            message: "Built files are newer than the Gateway process. Restart the Gateway before relying on this channel runtime.",
        });
    }
    if (connection.enabled && connection.configured && !runtime.isRunning) {
        issues.push({
            code: "runtime_stopped",
            severity: "warning",
            message: "Channel is configured but runtime is not running.",
        });
    }
    if (!connection.enabled && runtime.isRunning) {
        issues.push({
            code: "runtime_state_mismatch",
            severity: "warning",
            message: "Runtime is active while the channel is disabled in config.",
        });
    }
    if (connection.provider === "discord") {
        const doctor = buildDiscordPermissionDoctor(config.discord);
        for (const issue of doctor.issues) {
            issues.push({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
            });
        }
    }
    if (connection.provider === "google_chat") {
        const doctor = buildGoogleChatWorkspaceDoctor(config.googleChat);
        for (const issue of doctor.issues) {
            issues.push({
                code: issue.code,
                severity: issue.severity,
                message: issue.message,
            });
        }
    }
    return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
    };
}
function channelSummary(connection, config) {
    const capabilities = connection.capabilityManifest;
    return {
        channelId: connection.connectionId,
        connectionId: connection.connectionId,
        provider: connection.provider,
        displayName: connection.displayName,
        enabled: connection.enabled,
        configured: connection.configured,
        connectionMode: connection.connectionMode,
        health: connection.health,
        runtime: providerRuntimeStatus(connection.provider),
        riskLevel: capabilities.riskLevel,
        capabilitySummary: {
            supportsThreads: capabilities.supportsThreads,
            supportsReplies: capabilities.supportsReplies,
            supportsButtons: capabilities.supportsButtons,
            supportsFiles: capabilities.supportsFiles,
            supportsTypingIndicator: capabilities.supportsTypingIndicator,
            maxMessageLength: capabilities.maxMessageLength,
            requiresWebhook: capabilities.requiresWebhook,
            requiresLocalBridge: capabilities.requiresLocalBridge,
            requiresUserSession: capabilities.requiresUserSession,
            manualConfirmationRequired: capabilities.manualConfirmationRequired === true,
        },
        validation: connectionValidation(connection, config),
    };
}
function channelDetail(connection, config) {
    return {
        ...channelSummary(connection, config),
        secrets: redactValue(connection.authSecretRefs),
        allowedUsers: connection.allowedUsers,
        allowedRooms: connection.allowedRooms,
        defaultDeliveryPolicy: connection.defaultDeliveryPolicy,
        configSource: connection.configSource,
        source: connection.source,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
    };
}
function recordRuntime(connection, eventKind, summary, detail) {
    const event = {
        connection,
        eventKind,
        healthStatus: connection.health.status,
        summary,
    };
    if (detail)
        event.detail = redactValue(detail);
    try {
        recordChannelRuntimeEvent(event);
    }
    catch {
        // Runtime audit is best-effort. Placeholder/future providers may not have a persisted connection row yet.
    }
}
function asRuntimeProvider(provider) {
    return provider === "telegram" || provider === "slack" || provider === "discord" || provider === "google_chat" ? provider : undefined;
}
const UNSUPPORTED_CHANNEL_RUNTIME_ERROR = "provider runtime is not implemented yet";
function unsupportedChannelRuntimePayload(connection, config) {
    return {
        ok: false,
        error: UNSUPPORTED_CHANNEL_RUNTIME_ERROR,
        channel: channelSummary(connection, config),
    };
}
async function restartConnection(connection, config, paths, body, reply) {
    const cfg = config;
    if (!asRuntimeProvider(connection.provider)) {
        return reply.status(501).send({
            ...unsupportedChannelRuntimePayload(connection, cfg),
            configCommand: buildRejectedConfigurationCommand("channels.restart", "channel_runtime_not_implemented"),
        });
    }
    const refreshed = requireConnection(connection.connectionId, cfg);
    const validation = connectionValidation(refreshed, cfg);
    if (!refreshed.enabled) {
        recordRuntime(refreshed, "restart_skipped_disabled", "Channel restart skipped because the channel is disabled.");
        return {
            ok: true,
            status: "disabled",
            channel: channelSummary(refreshed, cfg),
            configCommand: buildRuntimeAppliedConfigurationCommand("channels.restart"),
        };
    }
    if (!refreshed.configured || validation.ok === false) {
        recordRuntime(refreshed, "restart_failed_validation", "Channel restart blocked by validation.", { validation });
        return reply.status(400).send({
            ok: false,
            error: "enabled channel is missing required configuration",
            validation,
            channel: channelSummary(refreshed, cfg),
            configCommand: buildRejectedConfigurationCommand("channels.restart", "channel_configuration_invalid"),
        });
    }
    if (body.dryRun === true) {
        recordRuntime(refreshed, "restart_dry_run", "Channel restart dry-run completed.", { initiatedBy: body.initiatedBy ?? "webui" });
        return {
            ok: true,
            status: "dry_run",
            channel: channelSummary(refreshed, cfg),
            configCommand: buildRuntimeAppliedConfigurationCommand("channels.restart.dry_run"),
        };
    }
    try {
        const artifactStorage = createArtifactStorageContext(paths);
        let recovery;
        if (connection.provider === "telegram") {
            if (getActiveTelegramChannel())
                stopActiveTelegramChannel();
            setTelegramRuntimeError(null);
            const channel = new TelegramChannel(cfg.telegram, artifactStorage);
            await channel.start();
            setActiveTelegramChannel(channel);
            recovery = await recoverPendingResponsesForChannelRuntime(createStartedChannelRecoveryRuntime({ telegram: channel }));
        }
        else if (connection.provider === "slack") {
            if (getActiveSlackChannel())
                stopActiveSlackChannel();
            setSlackRuntimeError(null);
            const channel = new SlackChannel(cfg.slack, artifactStorage);
            await channel.start();
            setActiveSlackChannel(channel);
            recovery = await recoverPendingResponsesForChannelRuntime(createStartedChannelRecoveryRuntime({ slack: channel }));
        }
        else if (connection.provider === "discord") {
            stopDiscordRuntime();
            setDiscordRuntimeError(null);
            const adapter = new DiscordChannelAdapter({ config: cfg.discord });
            await adapter.start();
        }
        else {
            stopGoogleChatRuntime();
            setGoogleChatRuntimeError(null);
            const adapter = new GoogleChatChannelAdapter({ config: cfg.googleChat });
            await adapter.start();
        }
        const started = requireConnection(connection.connectionId, cfg);
        recordRuntime(started, "restarted", "Channel runtime restarted.", { initiatedBy: body.initiatedBy ?? "webui" });
        return {
            ok: true,
            status: "started",
            channel: channelSummary(started, cfg),
            ...(recovery ? { recovery } : {}),
            configCommand: buildRuntimeAppliedConfigurationCommand("channels.restart"),
        };
    }
    catch (error) {
        const message = channelRouteRuntimeErrorMessage(error, cfg, paths);
        if (connection.provider === "telegram")
            setTelegramRuntimeError(message);
        else if (connection.provider === "slack")
            setSlackRuntimeError(message);
        else if (connection.provider === "discord")
            setDiscordRuntimeError(message);
        else
            setGoogleChatRuntimeError(message);
        const failed = requireConnection(connection.connectionId, cfg);
        recordRuntime(failed, "restart_failed", "Channel runtime restart failed.", { message });
        return reply.status(500).send({
            ok: false,
            error: message,
            channel: channelSummary(failed, cfg),
            configCommand: buildRuntimeFailedConfigurationCommand("channels.restart", "channel_restart_failed"),
        });
    }
}
function messageLedgerResponse(event) {
    return {
        type: "ledger_event",
        id: event.id,
        runId: event.run_id,
        requestGroupId: event.request_group_id,
        sessionKey: event.session_key,
        threadKey: event.thread_key,
        channel: event.channel,
        eventKind: event.event_kind,
        deliveryKey: event.delivery_key,
        idempotencyKey: event.idempotency_key,
        status: event.status,
        summary: event.summary,
        detail: redactValue(safeParseJson(event.detail_json)),
        createdAt: event.created_at,
    };
}
function messageRefResponse(ref) {
    return {
        type: "channel_message_ref",
        id: ref.id,
        source: ref.source,
        sessionId: ref.session_id,
        runId: ref.root_run_id,
        requestGroupId: ref.request_group_id,
        externalChatId: ref.external_chat_id,
        externalThreadId: ref.external_thread_id,
        externalMessageId: ref.external_message_id,
        role: ref.role,
        createdAt: ref.created_at,
    };
}
function listChannelMessageRefs(input) {
    const where = [];
    const values = [];
    if (input.channel) {
        where.push("source = ?");
        values.push(input.channel);
    }
    if (input.runId) {
        where.push("root_run_id = ?");
        values.push(input.runId);
    }
    if (input.requestGroupId) {
        where.push("request_group_id = ?");
        values.push(input.requestGroupId);
    }
    values.push(input.limit);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return getDb()
        .prepare(`SELECT *
       FROM channel_message_refs
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`)
        .all(...values);
}
function listChannelMessages(query) {
    const limit = parseLimit(query.limit);
    const ledgerQuery = { limit };
    if (query.runId)
        ledgerQuery.runId = query.runId;
    if (query.requestGroupId)
        ledgerQuery.requestGroupId = query.requestGroupId;
    if (query.sessionKey)
        ledgerQuery.sessionKey = query.sessionKey;
    if (query.threadKey)
        ledgerQuery.threadKey = query.threadKey;
    const ledger = listMessageLedgerEvents(ledgerQuery)
        .filter((event) => !query.channel || event.channel === query.channel)
        .map(messageLedgerResponse);
    const refQuery = { limit };
    if (query.channel)
        refQuery.channel = query.channel;
    if (query.runId)
        refQuery.runId = query.runId;
    if (query.requestGroupId)
        refQuery.requestGroupId = query.requestGroupId;
    const refs = listChannelMessageRefs(refQuery).map(messageRefResponse);
    return [...ledger, ...refs]
        .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
        .slice(0, limit);
}
function getLedgerById(id) {
    return getDb()
        .prepare("SELECT * FROM message_ledger WHERE id = ? LIMIT 1")
        .get(id);
}
function getMessageRefById(id) {
    return getDb()
        .prepare("SELECT * FROM channel_message_refs WHERE id = ? LIMIT 1")
        .get(id);
}
function findDeliveryEvents(deliveryId) {
    return getDb()
        .prepare(`SELECT *
       FROM message_ledger
       WHERE id = ?
          OR delivery_key = ?
          OR idempotency_key = ?
       ORDER BY created_at DESC, id DESC`)
        .all(deliveryId, deliveryId, deliveryId);
}
function approvalResponse(row) {
    return {
        id: row.id,
        runId: row.run_id,
        requestGroupId: row.request_group_id,
        channel: row.channel,
        channelMessageId: row.channel_message_id,
        toolName: row.tool_name,
        riskLevel: row.risk_level,
        kind: row.kind,
        status: row.status,
        paramsHash: row.params_hash,
        paramsPreview: redactValue(safeParseJson(row.params_preview_json) ?? row.params_preview_json),
        requestedAt: row.requested_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        decisionAt: row.decision_at,
        decisionBy: row.decision_by,
        decisionSource: row.decision_source,
        supersededBy: row.superseded_by,
        metadata: redactValue(safeParseJson(row.metadata_json)),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function listApprovals(query) {
    const where = [];
    const values = [];
    if (query.status) {
        where.push("status = ?");
        values.push(query.status);
    }
    if (query.runId) {
        where.push("run_id = ?");
        values.push(query.runId);
    }
    if (query.requestGroupId) {
        where.push("request_group_id = ?");
        values.push(query.requestGroupId);
    }
    values.push(parseLimit(query.limit, 100, 500));
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return getDb()
        .prepare(`SELECT *
       FROM approval_registry
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`)
        .all(...values);
}
function isApprovalDecision(value) {
    return value === "allow_once" || value === "allow_run" || value === "deny";
}
function respondToApproval(approvalId, body, sourceFallback, dependencies) {
    const decision = body.decision;
    if (!isApprovalDecision(decision)) {
        return { ok: false, statusCode: 400, error: "invalid approval decision" };
    }
    const pendingRow = getApprovalRegistryRow(approvalId);
    const runtimeResumed = Boolean(pendingRow?.status === "requested" &&
        dependencies.resolveRegisteredWebUiApproval({
            approvalId: pendingRow.id,
            runId: pendingRow.run_id,
            decision,
        }));
    const runtimeRow = runtimeResumed ? getApprovalRegistryRow(approvalId) : null;
    const result = runtimeRow && runtimeRow.status !== "requested"
        ? {
            accepted: true,
            status: runtimeRow.status,
            reason: undefined,
            decision,
            row: runtimeRow,
        }
        : resolveApprovalRegistryDecision({
            approvalId,
            decision,
            decisionBy: body.decisionBy ?? "webui",
            decisionSource: body.decisionSource ?? sourceFallback,
        });
    if (result.accepted && result.row) {
        eventBus.emit("approval.resolved", {
            approvalId: result.row.id,
            runId: result.row.run_id,
            decision,
            toolName: result.row.tool_name,
            kind: result.row.kind,
            reason: "user",
        });
    }
    return {
        ok: result.accepted,
        accepted: result.accepted,
        status: result.status,
        reason: result.reason,
        decision: result.decision,
        runtimeResumed,
        approval: result.row ? approvalResponse(result.row) : null,
    };
}
function buildInteractionVerification(body) {
    return {
        verified: true,
        trustBoundary: "authenticated_webui_api",
        providerBoundary: "webhook/socket signature verification stays inside provider adapters",
        suppliedRawSignature: Boolean(body.rawSignature),
        suppliedSecretToken: Boolean(body.secretToken),
    };
}
export function registerChannelsRoute(app, dependencies = defaultChannelsRouteDependencies) {
    app.get("/api/channels", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        const channels = listConnections(config).map((connection) => channelSummary(connection, config));
        return { channels, count: channels.length };
    });
    app.get("/api/channels/:channelId", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        return { channel: channelDetail(connection, config) };
    });
    app.get("/api/channels/:channelId/health", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        return {
            channelId: connection.connectionId,
            provider: connection.provider,
            health: connection.health,
            runtime: providerRuntimeStatus(connection.provider),
            validation: connectionValidation(connection, config),
        };
    });
    app.get("/api/channels/:channelId/capabilities", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        return {
            channelId: connection.connectionId,
            provider: connection.provider,
            capabilities: redactValue(connection.capabilityManifest),
        };
    });
    app.post("/api/channels/:channelId/enable", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const paths = getApiRuntimePaths(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        const runtimeProvider = asRuntimeProvider(connection.provider);
        if (!runtimeProvider) {
            if (connection.capabilityManifest.requiresLocalBridge && !(req.body?.acknowledgeRisk || req.body?.riskAcknowledged)) {
                recordRuntime(connection, "enable_blocked_risk_ack", "Local bridge enable blocked until user acknowledges risk.");
                return reply.status(400).send({
                    ok: false,
                    error: "local bridge channels require explicit risk acknowledgment",
                    requiresRiskAcknowledgment: true,
                    channel: channelSummary(connection, config),
                });
            }
            if (connection.capabilityManifest.requiresLocalBridge) {
                const updated = updateRawLocalBridgeEnabled(connection, true, true, config, paths);
                return {
                    ok: true,
                    channel: channelDetail(updated.connection, updated.config),
                    restartRequired: true,
                    appliesOn: "explicit_restart",
                    configCommand: buildPersistedConfigurationCommand("channels.enable"),
                };
            }
            recordRuntime(connection, "enable_unsupported_provider", "Channel enable blocked because provider runtime is not implemented.");
            return reply.status(501).send(unsupportedChannelRuntimePayload(connection, config));
        }
        const updated = updateRawChannelEnabled(runtimeProvider, true, config, paths);
        return {
            ok: true,
            channel: channelDetail(updated.connection, updated.config),
            restartRequired: true,
            appliesOn: "explicit_restart",
            configCommand: buildPersistedConfigurationCommand("channels.enable"),
        };
    });
    app.post("/api/channels/:channelId/disable", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const paths = getApiRuntimePaths(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        const runtimeProvider = asRuntimeProvider(connection.provider);
        if (!runtimeProvider) {
            if (connection.capabilityManifest.requiresLocalBridge) {
                const updated = updateRawLocalBridgeEnabled(connection, false, false, config, paths);
                return {
                    ok: true,
                    channel: channelDetail(updated.connection, updated.config),
                    runtimeApplied: false,
                    restartRequired: true,
                    appliesOn: "next_start",
                    configCommand: buildPersistedConfigurationCommand("channels.disable"),
                };
            }
            return reply.status(501).send(unsupportedChannelRuntimePayload(connection, config));
        }
        if (runtimeProvider === "telegram")
            stopActiveTelegramChannel();
        if (runtimeProvider === "slack")
            stopActiveSlackChannel();
        if (runtimeProvider === "discord")
            stopDiscordRuntime();
        if (runtimeProvider === "google_chat")
            stopGoogleChatRuntime();
        const updated = updateRawChannelEnabled(runtimeProvider, false, config, paths);
        return {
            ok: true,
            channel: channelDetail(updated.connection, updated.config),
            runtimeApplied: true,
            restartRequired: false,
            appliesOn: "current_runtime",
            configCommand: buildPersistedRuntimeAppliedConfigurationCommand("channels.disable"),
        };
    });
    app.post("/api/channels/:channelId/restart", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const paths = getApiRuntimePaths(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        return restartConnection(connection, config, paths, req.body ?? {}, reply);
    });
    app.post("/api/channels/:channelId/test", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const connection = findConnection(req.params.channelId, config);
        if (!connection)
            return reply.status(404).send({ error: "Channel not found" });
        const validation = connectionValidation(connection, config);
        if (!connection.enabled) {
            recordRuntime(connection, "test_send_skipped_disabled", "Channel test send skipped because channel is disabled.");
            return reply.status(400).send({ ok: false, error: "channel is disabled", validation, channel: channelSummary(connection, config) });
        }
        if (!connection.configured || validation.ok === false) {
            recordRuntime(connection, "test_send_failed_validation", "Channel test send blocked by validation.", { validation });
            return reply.status(400).send({ ok: false, error: "channel is missing required configuration", validation, channel: channelSummary(connection, config) });
        }
        recordRuntime(connection, "test_send_dry_run", "Channel test send dry-run accepted.", { initiatedBy: req.body?.initiatedBy ?? "webui" });
        return {
            ok: true,
            mode: "dry-run",
            receipt: {
                channelId: connection.connectionId,
                provider: connection.provider,
                connectionId: connection.connectionId,
                status: "accepted",
                timestamp: Date.now(),
                idempotencyKey: `channel-test:${connection.connectionId}:${crypto.randomUUID()}`,
            },
            channel: channelSummary(connection, config),
        };
    });
    app.post("/api/channels/restart", { preHandler: authMiddleware }, async (req, reply) => {
        const config = getApiRuntimeConfig(req);
        const paths = getApiRuntimePaths(req);
        try {
            const activation = await activateChannelsAndRecoverPendingResponses(config, paths);
            return {
                ok: true,
                status: "started",
                recovery: activation.recovery,
                channels: listConnections(config).map((connection) => channelSummary(connection, config)),
                configCommand: buildRuntimeAppliedConfigurationCommand("channels.restart_all"),
            };
        }
        catch (error) {
            return reply.status(500).send({
                ok: false,
                error: channelRouteRuntimeErrorMessage(error, config, paths),
                configCommand: buildRuntimeFailedConfigurationCommand("channels.restart_all", "channels_restart_failed"),
            });
        }
    });
    app.get("/api/channel-messages", { preHandler: authMiddleware }, async (req) => {
        const messages = listChannelMessages(req.query);
        return { messages, count: messages.length };
    });
    app.get("/api/channel-messages/:messageId", { preHandler: authMiddleware }, async (req, reply) => {
        const ledger = getLedgerById(req.params.messageId);
        if (ledger)
            return { message: messageLedgerResponse(ledger) };
        const ref = getMessageRefById(req.params.messageId);
        if (ref)
            return { message: messageRefResponse(ref) };
        return reply.status(404).send({ error: "Channel message not found" });
    });
    app.get("/api/runs/:runId/channel-messages", { preHandler: authMiddleware }, async (req) => {
        const messages = listChannelMessages({ ...req.query, runId: req.params.runId });
        return { messages, count: messages.length };
    });
    app.get("/api/tasks/:taskId/channel-messages", { preHandler: authMiddleware }, async (req) => {
        const byRequestGroup = listChannelMessages({ ...req.query, requestGroupId: req.params.taskId });
        const byRun = listChannelMessages({ ...req.query, runId: req.params.taskId });
        const byId = new Map();
        for (const message of [...byRequestGroup, ...byRun])
            byId.set(String(message.id), message);
        const messages = [...byId.values()].sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
        return { messages, count: messages.length };
    });
    app.post("/api/channel-deliveries/:deliveryId/retry", { preHandler: authMiddleware }, async (req, reply) => {
        const events = findDeliveryEvents(req.params.deliveryId);
        if (events.length === 0)
            return reply.status(404).send({ ok: false, error: "Delivery not found" });
        const terminal = events.find((event) => FINAL_DELIVERY_EVENT_KINDS.has(event.event_kind) || TERMINAL_DELIVERY_STATUSES.has(event.status));
        if (terminal) {
            return {
                ok: true,
                status: "suppressed",
                reason: "already_finalized",
                delivery: messageLedgerResponse(terminal),
            };
        }
        const latest = events[0];
        const retryId = recordMessageLedgerEvent({
            runId: latest.run_id,
            requestGroupId: latest.request_group_id,
            sessionKey: latest.session_key,
            threadKey: latest.thread_key,
            channel: latest.channel,
            eventKind: "delivery_attempted",
            deliveryKey: latest.delivery_key ?? latest.id,
            idempotencyKey: `channel-delivery-retry:${req.params.deliveryId}`,
            status: "pending",
            summary: "Delivery retry requested by channel API.",
            detail: {
                originalDeliveryId: req.params.deliveryId,
                sourceEventId: latest.id,
                replayGuard: "retry recorded only; provider finalizer/idempotency still owns delivery",
            },
        });
        return {
            ok: true,
            status: retryId ? "accepted_for_reconciliation" : "already_requested",
            retryEventId: retryId,
            delivery: messageLedgerResponse(latest),
        };
    });
    app.get("/api/approvals", { preHandler: authMiddleware }, async (req) => {
        const approvals = listApprovals(req.query).map(approvalResponse);
        return { approvals, count: approvals.length };
    });
    app.post("/api/approvals/:approvalId/respond", { preHandler: authMiddleware }, async (req, reply) => {
        const result = respondToApproval(req.params.approvalId, req.body ?? {}, "api:webui", dependencies);
        if (result.statusCode === 400)
            return reply.status(400).send({ ok: false, error: result.error });
        if (result.status === "missing")
            return reply.status(404).send(result);
        return result;
    });
    app.post("/api/channel-interactions", { preHandler: authMiddleware }, async (req, reply) => {
        const body = req.body ?? {};
        const provider = body.provider?.trim();
        const connectionId = body.connectionId?.trim() || (provider ? `${provider}:primary` : "");
        if (!provider || !connectionId || !body.interactionId || !body.kind) {
            return reply.status(400).send({ ok: false, error: "provider, connectionId, interactionId, and kind are required" });
        }
        const config = getApiRuntimeConfig(req);
        const connection = findConnection(connectionId, config);
        if (!connection)
            return reply.status(404).send({ ok: false, error: "Channel not found" });
        const verification = buildInteractionVerification(body);
        const approvalId = body.approvalId ?? body.correlationId ?? body.value;
        let approval = null;
        if (body.approvalDecision && approvalId) {
            const result = respondToApproval(approvalId, {
                decision: body.approvalDecision,
                decisionBy: body.senderId ?? `${provider}:interaction`,
                decisionSource: `channel:${provider}`,
            }, `channel:${provider}`, dependencies);
            if (result.statusCode === 400)
                return reply.status(400).send({ ok: false, error: result.error, verification });
            approval = result;
        }
        recordRuntime(connection, "interaction_received", "Channel interaction received by API.", {
            provider,
            interactionId: body.interactionId,
            kind: body.kind,
            messageId: body.messageId,
            threadId: body.threadId,
            roomId: body.roomId,
            actionId: body.actionId,
            value: body.value,
            rawPayload: body.rawPayload,
        });
        return {
            ok: true,
            interactionId: body.interactionId,
            provider,
            connectionId,
            verification,
            approval,
            existingApproval: approvalId ? (getApprovalRegistryRow(approvalId) ? approvalResponse(getApprovalRegistryRow(approvalId)) : null) : null,
        };
    });
}
//# sourceMappingURL=channels.js.map