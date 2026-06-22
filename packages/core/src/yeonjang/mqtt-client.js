import { createHash, randomUUID } from "node:crypto";
import mqtt from "mqtt";
import { getConfig } from "../config/index.js";
import { createLogger } from "../logger/index.js";
import { getMqttBrokerSnapshot, getMqttExtensionSnapshots, validateMqttBrokerConfig } from "../mqtt/broker.js";
import { recordMessageLedgerEvent } from "../runs/message-ledger.js";
const log = createLogger("yeonjang:mqtt");
export const DEFAULT_YEONJANG_EXTENSION_ID = "yeonjang-main";
const YEONJANG_CAPABILITY_TTL_MS = 5_000;
const capabilityCache = new Map();
const extensionExecutionQueues = new Map();
export function buildYeonjangTopics(extensionId = DEFAULT_YEONJANG_EXTENSION_ID) {
    const normalized = extensionId.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const prefix = `knowbee/v1/node/${normalized}`;
    return {
        statusTopic: `${prefix}/status`,
        capabilitiesTopic: `${prefix}/capabilities`,
        requestTopic: `${prefix}/request`,
        responseTopic: `${prefix}/response`,
        eventTopic: `${prefix}/event`,
    };
}
export async function invokeYeonjangMethod(method, params = {}, options = {}) {
    const extensionId = options.extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
    const timeoutMs = clampTimeout(options.timeoutMs);
    const normalizedMetadata = normalizeYeonjangRequestMetadata(options.metadata);
    const dispatchBase = createYeonjangCommandDispatch(method, params, {
        extensionId,
        timeoutMs,
        ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    });
    const execute = async () => {
        const topics = buildYeonjangTopics(extensionId);
        const autoRetryEligible = isYeonjangSafeRetryMethod(method);
        const maxAttempts = autoRetryEligible ? 2 : 1;
        let attempt = 0;
        let lastError = null;
        while (attempt < maxAttempts) {
            attempt += 1;
            const remainingMs = dispatchBase.expiresAt - Date.now();
            if (remainingMs <= 0) {
                recordYeonjangDeliveryLedgerEvent({
                    metadata: dispatchBase.metadata,
                    deliveryKey: dispatchBase.commandId,
                    idempotencyKey: `${dispatchBase.idempotencyKey}:expired`,
                    eventKind: "delivery_finalized",
                    status: "failed",
                    summary: `yeonjang command expired before delivery: ${method}`,
                    detail: {
                        method,
                        extensionId,
                        commandId: dispatchBase.commandId,
                        targetSessionId: dispatchBase.metadata.targetSessionId ?? null,
                    },
                });
                throw new Error("Yeonjang 명령 유효기간이 만료되었습니다.");
            }
            const request = createYeonjangCommandDispatch(method, params, {
                extensionId,
                timeoutMs,
                metadata: {
                    ...dispatchBase.metadata,
                    commandId: dispatchBase.commandId,
                    idempotencyKey: dispatchBase.idempotencyKey,
                    expiresAt: dispatchBase.expiresAt,
                    cancelToken: dispatchBase.cancelToken,
                },
            });
            const client = createClient();
            log.debug(`invoking ${method} on ${extensionId} (attempt ${attempt}/${maxAttempts})`);
            try {
                const attemptTimeoutMs = clampAttemptTimeout(timeoutMs, remainingMs);
                await waitForConnect(client, attemptTimeoutMs);
                await subscribe(client, topics.responseTopic);
                await publish(client, topics.requestTopic, request.request);
                recordYeonjangDeliveryLedgerEvent({
                    metadata: request.metadata,
                    deliveryKey: request.commandId,
                    idempotencyKey: `${request.idempotencyKey}:sent:${request.deliveryId}`,
                    eventKind: "delivery_attempted",
                    status: "sent",
                    summary: `yeonjang delivery sent: ${method}`,
                    detail: {
                        method,
                        extensionId,
                        commandId: request.commandId,
                        deliveryId: request.deliveryId,
                        targetSessionId: request.metadata.targetSessionId ?? null,
                        expiresAt: request.expiresAt,
                        attempt,
                        maxAttempts,
                        autoRetryEligible,
                    },
                });
                const response = await waitForResponse(client, topics.responseTopic, request.requestId, attemptTimeoutMs);
                recordYeonjangDeliveryLedgerEvent({
                    metadata: request.metadata,
                    deliveryKey: request.commandId,
                    idempotencyKey: `${request.idempotencyKey}:acked:${request.deliveryId}`,
                    eventKind: "delivery_receipted",
                    status: "delivered",
                    summary: `yeonjang delivery acked: ${method}`,
                    detail: {
                        method,
                        extensionId,
                        commandId: request.commandId,
                        deliveryId: request.deliveryId,
                        targetSessionId: request.metadata.targetSessionId ?? null,
                        attempt,
                        maxAttempts,
                        autoRetryEligible,
                    },
                });
                return response;
            }
            catch (error) {
                lastError = error;
                if (attempt < maxAttempts && isYeonjangUnavailableError(error) && dispatchBase.expiresAt > Date.now()) {
                    recordYeonjangDeliveryLedgerEvent({
                        metadata: request.metadata,
                        deliveryKey: request.commandId,
                        idempotencyKey: `${request.idempotencyKey}:retry:${attempt}`,
                        eventKind: "delivery_backoff_scheduled",
                        status: "pending",
                        summary: `yeonjang delivery retry scheduled: ${method}`,
                        detail: {
                            method,
                            extensionId,
                            commandId: request.commandId,
                            deliveryId: request.deliveryId,
                            attempt,
                            maxAttempts,
                            autoRetryEligible,
                            error: error instanceof Error ? error.message : String(error),
                        },
                    });
                    continue;
                }
                recordYeonjangDeliveryLedgerEvent({
                    metadata: request.metadata,
                    deliveryKey: request.commandId,
                    idempotencyKey: `${request.idempotencyKey}:failed:${request.deliveryId}`,
                    eventKind: "delivery_finalized",
                    status: "failed",
                    summary: `yeonjang delivery failed: ${method}`,
                    detail: {
                        method,
                        extensionId,
                        commandId: request.commandId,
                        deliveryId: request.deliveryId,
                        targetSessionId: request.metadata.targetSessionId ?? null,
                        attempt,
                        maxAttempts,
                        autoRetryEligible,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });
            }
            finally {
                await closeClient(client);
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Yeonjang 요청이 실패했습니다."));
    };
    if (!shouldSerializeYeonjangMethod(method)) {
        return await execute();
    }
    return await enqueueYeonjangExtensionExecution(extensionId, execute);
}
function normalizeYeonjangRequestMetadata(metadata) {
    if (!metadata)
        return undefined;
    const normalizedEntries = Object.entries(metadata).filter(([, value]) => {
        if (typeof value === "string")
            return value.trim().length > 0;
        return value != null;
    });
    if (normalizedEntries.length === 0)
        return undefined;
    return Object.fromEntries(normalizedEntries);
}
function normalizeMetadataString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function normalizeMetadataNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return null;
    return Math.floor(parsed);
}
function stableStringify(value) {
    if (value === undefined)
        return "null";
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    const entries = Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
}
function buildDefaultYeonjangIdempotencyKey(params) {
    const hash = createHash("sha256")
        .update(stableStringify({
        commandId: params.commandId,
        method: params.method,
        extensionId: params.extensionId,
        targetSessionId: params.targetSessionId ?? null,
        params: params.params,
    }))
        .digest("hex");
    return `yeonjang-command:${hash}`;
}
export function createYeonjangCommandDispatch(method, params = {}, options = {}) {
    const timeoutMs = clampTimeout(options.timeoutMs);
    const now = Date.now();
    const extensionId = normalizeExtensionId(options.extensionId);
    const metadata = normalizeYeonjangRequestMetadata(options.metadata) ?? {};
    const commandId = normalizeMetadataString(metadata.commandId) ?? randomUUID();
    const deliveryId = randomUUID();
    const targetSessionId = normalizeMetadataString(metadata.targetSessionId);
    const expiresAt = normalizeMetadataNumber(metadata.expiresAt) ?? (now + timeoutMs);
    const cancelToken = normalizeMetadataString(metadata.cancelToken) ?? `yeonjang-cancel:${commandId}`;
    const idempotencyKey = normalizeMetadataString(metadata.idempotencyKey) ?? buildDefaultYeonjangIdempotencyKey({
        commandId,
        method,
        extensionId,
        targetSessionId,
        params,
    });
    const nextMetadata = {
        ...metadata,
        ...(targetSessionId ? { targetSessionId } : {}),
        commandId,
        deliveryId,
        idempotencyKey,
        expiresAt,
        cancelToken,
    };
    return {
        requestId: deliveryId,
        commandId,
        deliveryId,
        idempotencyKey,
        expiresAt,
        cancelToken,
        metadata: nextMetadata,
        request: {
            id: deliveryId,
            method,
            params,
            metadata: nextMetadata,
        },
    };
}
export function isYeonjangSafeRetryMethod(method) {
    const normalized = method.trim().toLowerCase();
    return normalized === "node.capabilities"
        || normalized === "node.ping"
        || normalized === "system.info"
        || normalized === "camera.list"
        || normalized === "screen.capture";
}
function recordYeonjangDeliveryLedgerEvent(input) {
    if (!input.metadata.runId && !input.metadata.requestGroupId)
        return;
    recordMessageLedgerEvent({
        runId: input.metadata.runId ?? null,
        requestGroupId: input.metadata.requestGroupId ?? input.metadata.runId ?? null,
        sessionKey: input.metadata.sessionId ?? null,
        channel: input.metadata.source ?? "unknown",
        eventKind: input.eventKind,
        deliveryKey: input.deliveryKey,
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        summary: input.summary,
        detail: {
            ...input.detail,
            kind: "yeonjang_delivery",
            source: input.metadata.source ?? null,
            agentId: input.metadata.agentId ?? null,
            auditId: input.metadata.auditId ?? null,
            capabilityDelegationId: input.metadata.capabilityDelegationId ?? null,
            commandId: input.metadata.commandId ?? null,
            deliveryId: input.metadata.deliveryId ?? null,
            idempotencyKey: input.metadata.idempotencyKey ?? null,
            targetSessionId: input.metadata.targetSessionId ?? null,
            expiresAt: input.metadata.expiresAt ?? null,
            cancelToken: input.metadata.cancelToken ?? null,
        },
    });
}
export async function getYeonjangCapabilities(options = {}) {
    const extensionId = normalizeExtensionId(options.extensionId);
    if (!options.forceRefresh) {
        const cached = getFreshCachedCapabilities(extensionId);
        if (cached)
            return cached;
        const snapshot = getFreshCapabilitySnapshot(extensionId);
        if (snapshot) {
            const payload = snapshotToYeonjangCapabilitiesPayload(snapshot);
            rememberCapabilities(extensionId, payload);
            return payload;
        }
    }
    const payload = await invokeYeonjangMethod("node.capabilities", {}, { ...options, extensionId });
    rememberCapabilities(extensionId, payload);
    return payload;
}
export function clearYeonjangCapabilityCache() {
    capabilityCache.clear();
}
export function shouldSerializeYeonjangMethod(method) {
    const normalized = method.trim().toLowerCase();
    return normalized !== "node.capabilities" && normalized !== "camera.list";
}
export async function enqueueYeonjangExtensionExecution(extensionId, task) {
    const normalizedExtensionId = normalizeExtensionId(extensionId);
    const previous = extensionExecutionQueues.get(normalizedExtensionId) ?? Promise.resolve();
    let releaseCurrentQueue;
    const currentQueue = new Promise((resolve) => {
        releaseCurrentQueue = resolve;
    });
    const queued = previous
        .catch(() => undefined)
        .then(() => currentQueue);
    extensionExecutionQueues.set(normalizedExtensionId, queued);
    await previous.catch(() => undefined);
    try {
        return await task();
    }
    finally {
        releaseCurrentQueue();
        if (extensionExecutionQueues.get(normalizedExtensionId) === queued) {
            extensionExecutionQueues.delete(normalizedExtensionId);
        }
    }
}
export async function canYeonjangHandleMethod(method, options = {}) {
    try {
        const capabilities = await getYeonjangCapabilities(options);
        return doesYeonjangCapabilitySupportMethod(capabilities, method);
    }
    catch (error) {
        if (isYeonjangUnavailableError(error))
            return false;
        throw error;
    }
}
export function resolveYeonjangMethodCapability(capabilities, method) {
    const matrix = capabilities.capabilityMatrix ?? capabilities.capability_matrix;
    const matrixEntry = matrix?.[method];
    if (matrixEntry)
        return matrixEntry;
    return capabilities.methods?.find((candidate) => candidate.name === method) ?? null;
}
export function doesYeonjangCapabilitySupportMethod(capabilities, method) {
    const entry = resolveYeonjangMethodCapability(capabilities, method);
    if (!entry)
        return false;
    if ("supported" in entry && typeof entry.supported === "boolean")
        return entry.supported;
    if ("implemented" in entry && typeof entry.implemented === "boolean")
        return entry.implemented;
    return false;
}
export function hasYeonjangCapabilityMatrix(capabilities) {
    return Boolean(capabilities.capabilityMatrix ?? capabilities.capability_matrix);
}
export function resolveYeonjangCapabilityOutputModes(capabilities, method) {
    const entry = resolveYeonjangMethodCapability(capabilities, method);
    if (!entry || !Array.isArray(entry.outputModes))
        return null;
    return entry.outputModes
        .map((mode) => mode.trim().toLowerCase())
        .filter(Boolean);
}
export function doesYeonjangCapabilitySupportOutputMode(capabilities, method, outputMode) {
    const modes = resolveYeonjangCapabilityOutputModes(capabilities, method);
    if (!modes)
        return null;
    return modes.includes(outputMode.trim().toLowerCase());
}
export function snapshotToYeonjangCapabilitiesPayload(snapshot) {
    const matrix = snapshot.capabilityMatrix;
    return {
        node: "knowbee-yeonjang",
        ...(snapshot.version ? { version: snapshot.version } : {}),
        ...(snapshot.protocolVersion ? { protocolVersion: snapshot.protocolVersion } : {}),
        ...(snapshot.gitTag ? { gitTag: snapshot.gitTag } : {}),
        ...(snapshot.gitCommit ? { gitCommit: snapshot.gitCommit } : {}),
        ...(snapshot.buildTarget ? { buildTarget: snapshot.buildTarget } : {}),
        ...(snapshot.os ? { os: snapshot.os } : {}),
        ...(snapshot.arch ? { arch: snapshot.arch } : {}),
        ...(snapshot.platform ? { platform: snapshot.platform } : {}),
        ...(snapshot.transport ? { transport: snapshot.transport } : {}),
        ...(snapshot.capabilityHash ? { capabilityHash: snapshot.capabilityHash } : {}),
        ...(snapshot.supportProfile ? { supportProfile: snapshot.supportProfile } : {}),
        ...(snapshot.configuredSupportProfile ? { configuredSupportProfile: snapshot.configuredSupportProfile } : {}),
        ...(snapshot.supportProfileReasonCodes ? { supportProfileReasonCodes: snapshot.supportProfileReasonCodes } : {}),
        ...(typeof snapshot.interactiveDesktopAvailable === "boolean" ? { interactiveDesktopAvailable: snapshot.interactiveDesktopAvailable } : {}),
        ...(typeof snapshot.trayRuntimeAvailable === "boolean" ? { trayRuntimeAvailable: snapshot.trayRuntimeAvailable } : {}),
        ...(matrix ? { capabilityMatrix: matrix } : {}),
        methods: matrix
            ? Object.entries(matrix).map(([name, entry]) => matrixEntryToMethodCapability(name, entry))
            : snapshot.methods.map((name) => ({ name, implemented: true })),
        ...(snapshot.permissions ? { permissions: snapshot.permissions } : {}),
        ...(snapshot.toolHealth ? { toolHealth: snapshot.toolHealth } : {}),
        lastCapabilityRefreshAt: snapshot.lastCapabilityRefreshAt ?? snapshot.lastSeenAt,
    };
}
function matrixEntryToMethodCapability(name, entry) {
    return {
        name,
        implemented: entry.supported !== false,
        ...(typeof entry.supported === "boolean" ? { supported: entry.supported } : {}),
        ...(typeof entry.supportState === "string" ? { supportState: entry.supportState } : {}),
        ...(typeof entry.requiresApproval === "boolean" ? { requiresApproval: entry.requiresApproval } : {}),
        ...(typeof entry.requiresPermission === "boolean" ? { requiresPermission: entry.requiresPermission } : {}),
        ...(entry.permissionSetting !== undefined ? { permissionSetting: entry.permissionSetting } : {}),
        ...(entry.knownLimitations ? { knownLimitations: entry.knownLimitations } : {}),
        ...(typeof entry.requiresInteractiveDesktop === "boolean" ? { requiresInteractiveDesktop: entry.requiresInteractiveDesktop } : {}),
        ...(typeof entry.broadcastSafe === "boolean" ? { broadcastSafe: entry.broadcastSafe } : {}),
        ...(typeof entry.defaultTargetPolicy === "string" ? { defaultTargetPolicy: entry.defaultTargetPolicy } : {}),
        ...(entry.reasonCodes ? { reasonCodes: entry.reasonCodes } : {}),
        ...(entry.platformBaseline ? { platformBaseline: entry.platformBaseline } : {}),
        ...(entry.outputModes ? { outputModes: entry.outputModes } : {}),
        ...(typeof entry.lastCheckedAt === "number" ? { lastCheckedAt: entry.lastCheckedAt } : {}),
    };
}
function normalizeExtensionId(extensionId) {
    return extensionId?.trim() || DEFAULT_YEONJANG_EXTENSION_ID;
}
function rememberCapabilities(extensionId, payload) {
    capabilityCache.set(extensionId, { payload, cachedAt: Date.now() });
}
function getFreshCachedCapabilities(extensionId) {
    const cached = capabilityCache.get(extensionId);
    if (!cached)
        return null;
    if (Date.now() - cached.cachedAt > YEONJANG_CAPABILITY_TTL_MS)
        return null;
    return cached.payload;
}
function getFreshCapabilitySnapshot(extensionId) {
    const now = Date.now();
    const snapshot = getMqttExtensionSnapshots().find((candidate) => candidate.extensionId === extensionId);
    if (!snapshot)
        return null;
    if (String(snapshot.state ?? "").toLowerCase() === "offline")
        return null;
    if (!snapshot.capabilityMatrix && snapshot.methods.length === 0)
        return null;
    const refreshedAt = snapshot.lastCapabilityRefreshAt ?? snapshot.lastSeenAt;
    if (now - refreshedAt > YEONJANG_CAPABILITY_TTL_MS)
        return null;
    return snapshot;
}
export function isYeonjangUnavailableError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return [
        "mqtt 브로커가 비활성화되어 있습니다",
        "mqtt 브로커가 실행 중이 아닙니다",
        "yeonjang mqtt 연결 시간이 초과되었습니다",
        "yeonjang mqtt 응답 시간이 초과되었습니다",
        "yeonjang mqtt 연결이 닫혔습니다",
        "yeonjang mqtt 응답 대기 중 연결이 닫혔습니다",
        "connection refused",
        "connack timeout",
        "econnrefused",
        "getaddrinfo",
        "not authorized",
        "authentication",
    ].some((pattern) => normalized.includes(pattern));
}
function createClient() {
    const config = getConfig().mqtt;
    const snapshot = getMqttBrokerSnapshot();
    const validationError = validateMqttBrokerConfig(config);
    if (!config.enabled) {
        throw new Error("MQTT 브로커가 비활성화되어 있습니다.");
    }
    if (validationError) {
        throw new Error(validationError);
    }
    if (!snapshot.running) {
        throw new Error(snapshot.reason ?? "MQTT 브로커가 실행 중이 아닙니다.");
    }
    const host = normalizeConnectHost(config.host);
    return mqtt.connect(`mqtt://${host}:${config.port}`, {
        clientId: `knowbee-core-${process.pid}-${randomUUID().slice(0, 8)}`,
        username: config.username,
        password: config.password,
        connectTimeout: 5_000,
        reconnectPeriod: 0,
        clean: true,
    });
}
function normalizeConnectHost(host) {
    const trimmed = host.trim();
    if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::") {
        return "127.0.0.1";
    }
    return trimmed;
}
function clampTimeout(timeoutMs) {
    const candidate = Number(timeoutMs);
    if (!Number.isFinite(candidate))
        return 15_000;
    return Math.max(1_000, Math.min(60_000, Math.floor(candidate)));
}
function clampAttemptTimeout(timeoutMs, remainingMs) {
    if (!Number.isFinite(remainingMs))
        return timeoutMs;
    return Math.max(250, Math.min(timeoutMs, Math.floor(remainingMs)));
}
async function waitForConnect(client, timeoutMs) {
    await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Yeonjang MQTT 연결 시간이 초과되었습니다."));
        }, timeoutMs);
        const onConnect = () => {
            cleanup();
            resolve();
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onClose = () => {
            if (settled)
                return;
            cleanup();
            reject(new Error("Yeonjang MQTT 연결이 닫혔습니다."));
        };
        const cleanup = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            client.off("connect", onConnect);
            client.off("error", onError);
            client.off("close", onClose);
        };
        client.once("connect", onConnect);
        client.once("error", onError);
        client.once("close", onClose);
    });
}
async function subscribe(client, topic) {
    await new Promise((resolve, reject) => {
        client.subscribe(topic, { qos: 1 }, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
async function publish(client, topic, request) {
    await new Promise((resolve, reject) => {
        client.publish(topic, JSON.stringify(request), { qos: 1 }, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
async function waitForResponse(client, responseTopic, requestId, timeoutMs) {
    return await new Promise((resolve, reject) => {
        const chunkParts = new Map();
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Yeonjang MQTT 응답 시간이 초과되었습니다."));
        }, timeoutMs);
        const onMessage = (topic, payload) => {
            if (topic !== responseTopic)
                return;
            let parsed;
            try {
                parsed = JSON.parse(payload.toString("utf8"));
            }
            catch (error) {
                cleanup();
                reject(new Error(`Yeonjang 응답 JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`));
                return;
            }
            if (isChunkEnvelope(parsed)) {
                if (parsed.id && parsed.id !== requestId)
                    return;
                if (typeof parsed.chunk_index !== "number" || typeof parsed.chunk_count !== "number" || !parsed.base64_data) {
                    cleanup();
                    reject(new Error("Yeonjang 청크 응답 형식이 올바르지 않습니다."));
                    return;
                }
                chunkParts.set(parsed.chunk_index, parsed.base64_data);
                if (chunkParts.size < parsed.chunk_count)
                    return;
                const orderedParts = [];
                for (let index = 0; index < parsed.chunk_count; index += 1) {
                    const part = chunkParts.get(index);
                    if (!part) {
                        cleanup();
                        reject(new Error(`Yeonjang 청크 응답이 누락되었습니다. (${index + 1}/${parsed.chunk_count})`));
                        return;
                    }
                    orderedParts.push(part);
                }
                let response;
                try {
                    const bytes = Buffer.concat(orderedParts.map((part) => Buffer.from(part, "base64")));
                    response = JSON.parse(bytes.toString("utf8"));
                }
                catch (error) {
                    cleanup();
                    reject(new Error(`Yeonjang 청크 응답 복원 실패: ${error instanceof Error ? error.message : String(error)}`));
                    return;
                }
                if (response.id && response.id !== requestId)
                    return;
                cleanup();
                if (!response.ok) {
                    reject(createYeonjangResponseError(response.error));
                    return;
                }
                resolve((response.result ?? null));
                return;
            }
            const response = parsed;
            if (response.id && response.id !== requestId)
                return;
            cleanup();
            if (!response.ok) {
                reject(createYeonjangResponseError(response.error));
                return;
            }
            resolve((response.result ?? null));
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onClose = () => {
            cleanup();
            reject(new Error("Yeonjang MQTT 응답 대기 중 연결이 닫혔습니다."));
        };
        const cleanup = () => {
            clearTimeout(timer);
            client.off("message", onMessage);
            client.off("error", onError);
            client.off("close", onClose);
            chunkParts.clear();
        };
        client.on("message", onMessage);
        client.once("error", onError);
        client.once("close", onClose);
    });
}
function isChunkEnvelope(value) {
    return Boolean(value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        value.transport === "chunk");
}
function createYeonjangResponseError(error) {
    const instance = new Error(error?.message ?? "Yeonjang 요청이 실패했습니다.");
    if (error?.code) {
        ;
        instance.code = error.code;
    }
    return instance;
}
async function closeClient(client) {
    await new Promise((resolve) => {
        client.end(true, {}, () => resolve());
    });
}
//# sourceMappingURL=mqtt-client.js.map