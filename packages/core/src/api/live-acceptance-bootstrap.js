import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDefaultModel, getProvider } from "../ai/index.js";
import { createArtifactStorageContext, } from "../artifacts/lifecycle.js";
import { getDefaultChannelSmokeScenarios, runPersistedChannelSmokeScenarios, } from "../channels/smoke-runner.js";
import { insertAuditLog, listAgentCapabilityBindings, listAuditLogsForRun, listMcpServerCatalogEntries, listSkillCatalogEntries, } from "../db/index.js";
import { createFileBackedLiveAcceptanceLlmPorts, } from "../release/live-acceptance-llm-adapter.js";
import { captureLiveAcceptanceRuntimeSnapshot } from "../release/live-acceptance-runtime-snapshot-adapter.js";
import { inspectLiveAcceptanceSelectionAvailability } from "../release/live-acceptance-selection-preflight.js";
import { createLiveAcceptanceSigningRequestFileSink } from "../release/live-acceptance-signing-request-file-sink.js";
import { invokeYeonjangMethod } from "../yeonjang/mqtt-client.js";
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js";
import { createLiveAcceptanceRuntimeFactory } from "./live-acceptance-runtime-factory.js";
import { createLiveAcceptanceRuntimeIdentityInspector } from "../runtime/live-acceptance-runtime-identity-adapter.js";
const LIVE_MAX_AGE_MS = 60_000;
const LIVE_YEONJANG_TIMEOUT_MS = 15_000;
export function resolveConfiguredTelegramLiveSmokeTarget(config) {
    const telegram = config.telegram;
    if (!telegram?.enabled ||
        !telegram.botToken.trim() ||
        telegram.allowedUserIds.length !== 1 ||
        telegram.allowedGroupIds.length !== 0) {
        return undefined;
    }
    const [userId] = telegram.allowedUserIds;
    if (userId === undefined || !Number.isSafeInteger(userId) || userId <= 0)
        return undefined;
    return Object.freeze({ chatId: userId, userId });
}
export function createLiveAcceptanceBootstrapDependencies(input) {
    const config = input.config;
    const ports = input.ports;
    const factory = createLiveAcceptanceRuntimeFactory({
        readers: ports.readers,
        inspectRuntimeIdentity: ports.inspectRuntimeIdentity,
        dispatcher: input.dispatcher,
        webContextFor: ({ runId, scenario, signal }) => ({
            artifactStorage: ports.artifactStorage,
            sessionId: `live-acceptance:${runId}`,
            runId,
            workDir: config.profile.workspace,
            userMessage: scenario.request,
            source: "webui",
            allowWebAccess: true,
            onProgress: () => undefined,
            signal,
            mqttConfig: config.mqtt,
            securityConfig: config.security,
            searchConfig: config.search,
            memoryConfig: config.memory,
        }),
        extensionBaseContextFor: ({ runId }) => ({
            artifactStorage: ports.artifactStorage,
            sessionId: `live-acceptance:${runId}`,
            workDir: config.profile.workspace,
            userMessage: "live acceptance extension verification",
            source: "webui",
            onProgress: () => undefined,
            auditId: `live-acceptance:${runId}`,
            mqttConfig: config.mqtt,
            securityConfig: config.security,
            searchConfig: config.search,
            memoryConfig: config.memory,
        }),
        findAuditEventId: ports.findAuditEventId,
        llm: ports.llm,
        invokeYeonjang: ports.invokeYeonjang,
        yeonjangTimeoutMs: LIVE_YEONJANG_TIMEOUT_MS,
        createCommandId: ports.createId,
        createAuditCorrelationId: ports.createId,
        recordYeonjangAuditEvent: ports.recordYeonjangAuditEvent,
        runChannels: ports.runChannels,
        requestSink: ports.requestSink,
        createRunId: ({ stage, scenarioId }) => `live-acceptance:${stage}:${scenarioId ?? "all"}:${ports.createId()}`,
        now: ports.now,
        policy: Object.freeze({
            failurePolicy: "continue_diagnostics",
            maxPreflightAgeMs: LIVE_MAX_AGE_MS,
            maxWebSourceAgeMs: LIVE_MAX_AGE_MS,
            maxYeonjangSessionAgeMs: LIVE_MAX_AGE_MS,
            maxEvidenceAgeMs: LIVE_MAX_AGE_MS,
            maxYeonjangInstanceAgeMs: LIVE_MAX_AGE_MS,
        }),
    });
    const liveAcceptanceSelectionAvailabilityInspector = () => {
        const now = ports.now();
        return inspectLiveAcceptanceSelectionAvailability({
            snapshot: captureLiveAcceptanceRuntimeSnapshot({
                capturedAt: now,
                readers: ports.readers,
            }),
            now,
            maxYeonjangAgeMs: LIVE_MAX_AGE_MS,
        });
    };
    return Object.freeze({
        liveAcceptanceExecutorFactory: factory,
        liveAcceptanceSelectionAvailabilityInspector,
        liveAcceptanceRuntimeIdentityInspector: ports.inspectRuntimeIdentity,
    });
}
function findAuditEventId(input) {
    const logs = listAuditLogsForRun(input.runId);
    for (let index = logs.length - 1; index >= 0; index -= 1) {
        const event = logs[index];
        if (event?.tool_name === input.toolName &&
            (!input.requestGroupId || event.request_group_id === input.requestGroupId)) {
            return event.id;
        }
    }
    return null;
}
function recordYeonjangAuditEvent(event) {
    return insertAuditLog({
        timestamp: Date.now(),
        session_id: null,
        run_id: event.runId,
        request_group_id: event.requestGroupId,
        source: "system",
        tool_name: "live_acceptance_yeonjang",
        params: JSON.stringify({
            commandId: event.commandId,
            instanceId: event.instanceId,
            sessionId: event.sessionId,
            method: event.method,
        }),
        output: JSON.stringify({ evidenceRef: event.evidenceRef }),
        result: "success",
        duration_ms: null,
        approval_required: 0,
        approved_by: null,
    });
}
export function createDefaultLiveAcceptanceBootstrapDependencies(input) {
    const provider = getProvider(undefined, input.config);
    const model = getDefaultModel(input.config);
    const outputDir = join(input.paths.stateDir, "release", "live-acceptance-signing-requests");
    mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    const basicChannelScenarios = getDefaultChannelSmokeScenarios().filter((scenario) => scenario.kind === "basic_query" &&
        (scenario.channel === "webui" ||
            scenario.channel === "telegram" ||
            scenario.channel === "slack"));
    const readers = Object.freeze({
        listBindings: () => listAgentCapabilityBindings({ includeArchived: true }),
        listSkillCatalogs: () => listSkillCatalogEntries({ includeArchived: true }),
        listMcpCatalogs: () => listMcpServerCatalogEntries({ includeArchived: true }),
        listTools: () => input.dispatcher.getAll({ includeIsolated: true }),
        listYeonjangInstances: (capturedAt) => listYeonjangRegistryInstances({ now: capturedAt }),
    });
    const ports = Object.freeze({
        readers,
        inspectRuntimeIdentity: createLiveAcceptanceRuntimeIdentityInspector(),
        llm: createFileBackedLiveAcceptanceLlmPorts({
            provider,
            model,
            workDir: input.config.profile.workspace,
        }),
        artifactStorage: createArtifactStorageContext(input.paths),
        findAuditEventId,
        invokeYeonjang: (method, params, options) => invokeYeonjangMethod(method, params, { ...options, mqttConfig: input.config.mqtt }),
        recordYeonjangAuditEvent,
        runChannels: (executor) => runPersistedChannelSmokeScenarios({
            config: input.config,
            mode: "live-run",
            scenarios: [...basicChannelScenarios],
            initiatedBy: "release-live-acceptance",
            metadata: { source: "live-acceptance" },
            executeScenario: executor,
        }),
        requestSink: createLiveAcceptanceSigningRequestFileSink({ outputDir }),
        now: Date.now,
        createId: randomUUID,
    });
    const dependencies = createLiveAcceptanceBootstrapDependencies({
        config: input.config,
        dispatcher: input.dispatcher,
        ports,
    });
    const telegramLiveSmokeTarget = resolveConfiguredTelegramLiveSmokeTarget(input.config);
    return Object.freeze({
        ...dependencies,
        ...(telegramLiveSmokeTarget ? { telegramLiveSmokeTarget } : {}),
    });
}
//# sourceMappingURL=live-acceptance-bootstrap.js.map