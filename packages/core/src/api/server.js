import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import websocketPlugin from "@fastify/websocket";
import Fastify from "fastify";
import { buildArtifactAccessDescriptor, createArtifactStorageContext, resolveArtifactDataClassification, startArtifactCleanupScheduler, stopArtifactCleanupScheduler, } from "../artifacts/lifecycle.js";
import { closeChannelRuntimeStorage } from "../channels/index.js";
import { createSlackLiveSmokeExecutor } from "../channels/slack-live-smoke-executor.js";
import { getActiveSlackChannel, stopActiveSlackChannel } from "../channels/slack/runtime.js";
import { createTelegramLiveSmokeExecutor } from "../channels/telegram-live-smoke-executor.js";
import { getActiveTelegramChannel, stopActiveTelegramChannel, } from "../channels/telegram/runtime.js";
import { createWebUiLiveSmokeExecutor } from "../channels/webui-live-smoke-executor.js";
import { createLiveSmokeDecisionReceiptReader } from "../channels/live-smoke-decision-receipts.js";
import { createLiveSmokeFirstResponseLatencyReader } from "../channels/live-smoke-latency-evidence.js";
import { listLatencyMetrics } from "../observability/latency.js";
import { parseEnterpriseTopologyBuilderUiEnabled } from "../control-plane/index.js";
import { installControlEventProjection } from "../control-plane/timeline.js";
import { listArtifactMetadataForRun, listArtifactReceiptsForRun, listAuditLogsForRun, listChannelMessageRefsForRun, listDecisionTracesForRun, listMessageLedgerEvents, getDb, } from "../db/index.js";
import { SqliteCapabilityAdmissionEvidenceReader } from "../db/capability-admission-evidence-reader.js";
import { SqliteTypedObservabilityEventRepository } from "../db/typed-observability-event-repository.js";
import { SqliteLlmInvocationReceiptRepository } from "../db/llm-invocation-receipt-repository.js";
import { eventBus } from "../events/index.js";
import { createLogger } from "../logger/index.js";
import { mcpRegistry } from "../mcp/registry.js";
import { createMemoryJournalRepository } from "../memory/journal.js";
import { stopMqttBroker } from "../mqtt/broker.js";
import { installOrchestrationEventProjection } from "../orchestration/event-ledger.js";
import { createAgentHierarchyStorage } from "../orchestration/hierarchy.js";
import { pluginLoader } from "../plugins/loader.js";
import { markGatewayFailed, markGatewayReady, markGatewayStarting, } from "../runtime/gateway-readiness.js";
import { getLatestApprovalForRun } from "../runs/approval-registry.js";
import { isTerminalRunStatus } from "../runs/flow-contract.js";
import { cancelRootRun, getRequestExecutionOutcome, getRootRun, listRequestGroupRuns, } from "../runs/store.js";
import { startScheduler, stopScheduler } from "../scheduler/index.js";
import { listTopologyRunsForRootRun } from "../topology-runtime/trace.js";
import { createUpdateRuntimeContext } from "../update/service.js";
import { registerAdminRoute } from "./routes/admin.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerArtifactsRoute } from "./routes/artifacts.js";
import { registerAuditRoute } from "./routes/audit.js";
import { registerBenchmarkRoutes } from "./routes/benchmarks.js";
import { registerCapabilitiesRoute } from "./routes/capabilities.js";
import { registerChannelSmokeRoute } from "./routes/channel-smoke.js";
import { registerChannelsRoute } from "./routes/channels.js";
import { registerCommandPaletteRoutes } from "./routes/command-palette.js";
import { registerConfigOperationsRoute } from "./routes/config-operations.js";
import { registerControlTimelineRoute } from "./routes/control-timeline.js";
import { registerDataExchangeRoutes } from "./routes/data-exchanges.js";
import { registerDoctorRoute } from "./routes/doctor.js";
import { registerInstructionsRoute } from "./routes/instructions.js";
import { registerLiveAcceptanceRoute, } from "./routes/live-acceptance.js";
import { registerMcpRoute } from "./routes/mcp.js";
import { registerMemoryRoute } from "./routes/memory.js";
import { registerOrchestrationEventsRoute } from "./routes/orchestration-events.js";
import { registerPluginsRoute } from "./routes/plugins.js";
import { registerPromptSourcesRoute } from "./routes/prompt-sources.js";
import { startCanonicalLocalRun } from "./routes/runs.js";
import { registerRunsRoute } from "./routes/runs.js";
import { registerSchedulerRoute } from "./routes/scheduler.js";
import { registerSchedulesRoute } from "./routes/schedules.js";
import { registerSettingsRoute } from "./routes/settings.js";
import { registerSetupRoute } from "./routes/setup.js";
import { registerStatusRoute } from "./routes/status.js";
import { registerSubSessionRoutes } from "./routes/subsessions.js";
import { registerToolsRoute } from "./routes/tools.js";
import { registerTopologyRoutes } from "./routes/topologies.js";
import { registerTopologyAnalysisRoutes } from "./routes/topology-analysis.js";
import { registerTopologyRunRoutes } from "./routes/topology-runs.js";
import { registerUiModeRoute } from "./routes/ui-mode.js";
import { registerUpdateRoute } from "./routes/update.js";
import { registerYeonjangInstancesRoute } from "./routes/yeonjang-instances.js";
import { installApiRuntimeConfig } from "./runtime-context.js";
import { createApiMcpMutationRuntime } from "./mcp-mutation-bootstrap.js";
import { resolveApiLiveAcceptanceExecutor, } from "./server-runtime-context.js";
import { createSlackLiveSmokeEvidenceReader } from "./slack-live-smoke-evidence.js";
import { createSlackLiveSmokeRuntimePorts } from "./slack-live-smoke-runtime.js";
import { createTelegramLiveSmokeEvidenceReader } from "./telegram-live-smoke-evidence.js";
import { createTelegramLiveSmokeRuntimePorts } from "./telegram-live-smoke-runtime.js";
import { createWebUiLiveSmokeEvidenceReader } from "./webui-live-smoke-evidence.js";
import { createWebUiLiveSmokeRuntimePorts } from "./webui-live-smoke-runtime.js";
import { getWebUiWsClientCount, registerWsRoute } from "./ws/stream.js";
const log = createLogger("api:server");
let server = null;
let apiMemoryJournal = null;
export function createAvailableChannelSmokeLiveExecutor(input) {
    if (!input.webui && !input.telegram && !input.slack)
        return undefined;
    return async (scenario) => {
        const executor = scenario.channel === "webui"
            ? input.webui
            : scenario.channel === "telegram"
                ? input.telegram
                : scenario.channel === "slack"
                    ? input.slack
                    : undefined;
        if (!executor)
            throw new Error(`channel_live_smoke_executor_unavailable:${scenario.channel}`);
        return executor(scenario);
    };
}
const resolveArtifactCleanupEvidence = (artifact) => {
    const referencedRuns = new Map();
    if (artifact.source_run_id) {
        const sourceRun = getRootRun(artifact.source_run_id);
        if (sourceRun)
            referencedRuns.set(sourceRun.id, sourceRun);
    }
    if (artifact.request_group_id) {
        for (const run of listRequestGroupRuns(artifact.request_group_id)) {
            referencedRuns.set(run.id, run);
        }
    }
    const activeReferenceCount = [...referencedRuns.values()]
        .filter((run) => run !== undefined)
        .filter((run) => !isTerminalRunStatus(run.status)).length;
    return {
        activeReferenceCount,
        referenceScanCompleted: true,
        migrationRequired: false,
        rollbackRequired: false,
        deletionApproved: true,
    };
};
function createUiModeRuntimeInput(runtime) {
    const env = { ...runtime.uiModeEnv };
    return {
        adminActivation: {
            env,
            argv: [...runtime.argv],
            ...(env.NODE_ENV === undefined ? {} : { nodeEnv: env.NODE_ENV }),
        },
        rollbackActivation: { env },
    };
}
export async function startServer(cfg, paths, runtime) {
    if (!cfg.webui.enabled)
        return;
    if (!runtime.startupProgress)
        markGatewayStarting();
    server = Fastify({ logger: false });
    installApiRuntimeConfig(server, cfg, paths);
    installControlEventProjection();
    installOrchestrationEventProjection();
    const capabilityProjectionOptions = {
        enterpriseTopologyBuilderEnabled: parseEnterpriseTopologyBuilderUiEnabled(runtime.enterpriseTopologyBuilderUi),
    };
    const uiModeRuntime = createUiModeRuntimeInput(runtime);
    const updateRuntime = createUpdateRuntimeContext(paths, runtime.updateEnv);
    const mcpMutationRuntime = createApiMcpMutationRuntime({
        config: cfg,
        paths,
        mcpProcessEnv: runtime.mcpProcessEnv,
    });
    const memoryJournal = createMemoryJournalRepository(paths);
    apiMemoryJournal = memoryJournal;
    const artifactStorage = createArtifactStorageContext(paths);
    const readLiveSmokeDecisionReceiptRefs = createLiveSmokeDecisionReceiptReader(new SqliteLlmInvocationReceiptRepository(), new SqliteCapabilityAdmissionEvidenceReader(getDb()));
    const readLiveSmokeFirstResponseLatency = createLiveSmokeFirstResponseLatencyReader({ list: listLatencyMetrics });
    const hierarchyStorage = createAgentHierarchyStorage(paths);
    const webUiLiveSmokeExecutor = runtime.channelSmokeLiveEnabled
        ? createWebUiLiveSmokeExecutor(createWebUiLiveSmokeRuntimePorts({
            startCanonicalRequest: (request) => startCanonicalLocalRun({
                artifactStorage,
                memoryJournal,
                hierarchyStorage,
                message: request,
                sessionId: undefined,
                model: undefined,
                source: "webui",
                config: cfg,
            }),
            observabilityRepository: new SqliteTypedObservabilityEventRepository(),
            listTopologyRunsForRootRun,
            readExecutionOutcome: getRequestExecutionOutcome,
            readDecisionReceiptRefs: readLiveSmokeDecisionReceiptRefs,
            readFirstResponseLatency: readLiveSmokeFirstResponseLatency,
            cancelRun: (runId) => {
                cancelRootRun(runId, {
                    eventLabel: "live_smoke_terminal_timeout",
                    stepSummary: "Live smoke terminal observation timed out.",
                    runSummary: "Live smoke timed out and cancelled its run.",
                });
            },
            readEvidence: createWebUiLiveSmokeEvidenceReader({
                listAuditLogsForRun,
                getLatestApprovalForRun,
                listArtifactReceiptsForRun,
                listArtifactMetadataForRun,
                listMessageLedgerEvents,
                buildArtifactAccess: (metadata) => buildArtifactAccessDescriptor({
                    filePath: metadata.artifact_path,
                    mimeType: metadata.mime_type,
                    ...(metadata.size_bytes === null ? {} : { sizeBytes: metadata.size_bytes }),
                    expiresAt: metadata.expires_at,
                    dataClassification: resolveArtifactDataClassification(metadata.metadata_json),
                }, artifactStorage),
                isWebUiApprovalVisible: () => getWebUiWsClientCount() > 0,
            }),
        }))
        : undefined;
    const telegramLiveSmokeExecutor = runtime.channelSmokeLiveEnabled && runtime.telegramLiveSmokeTarget
        ? createTelegramLiveSmokeExecutor(createTelegramLiveSmokeRuntimePorts({
            target: runtime.telegramLiveSmokeTarget,
            startCanonicalRequest: async ({ request, target }) => {
                const channel = getActiveTelegramChannel();
                if (!channel)
                    throw new Error("telegram_live_smoke_runtime_unavailable");
                return channel.acceptLiveSmokeRequest({ request, target });
            },
            observabilityRepository: new SqliteTypedObservabilityEventRepository(),
            listTopologyRunsForRootRun,
            readExecutionOutcome: getRequestExecutionOutcome,
            readDecisionReceiptRefs: readLiveSmokeDecisionReceiptRefs,
            readFirstResponseLatency: readLiveSmokeFirstResponseLatency,
            cancelRun: (runId) => {
                cancelRootRun(runId, {
                    eventLabel: "live_smoke_terminal_timeout",
                    stepSummary: "Live smoke terminal observation timed out.",
                    runSummary: "Live smoke timed out and cancelled its run.",
                });
            },
            readEvidence: createTelegramLiveSmokeEvidenceReader({
                listMessageLedgerEvents,
                listChannelMessageRefsForRun,
                listDecisionTracesForRun,
                listAuditLogsForRun,
                getLatestApprovalForRun,
                listArtifactReceiptsForRun,
            }),
        }))
        : undefined;
    const slackLiveSmokeExecutor = runtime.channelSmokeLiveEnabled && runtime.slackLiveSmokeTarget
        ? createSlackLiveSmokeExecutor(createSlackLiveSmokeRuntimePorts({
            target: runtime.slackLiveSmokeTarget,
            startCanonicalRequest: async ({ request, target }) => {
                const channel = getActiveSlackChannel();
                if (!channel)
                    throw new Error("slack_live_smoke_runtime_unavailable");
                return channel.acceptLiveSmokeRequest({ request, target });
            },
            observabilityRepository: new SqliteTypedObservabilityEventRepository(),
            listTopologyRunsForRootRun,
            readEvidence: createSlackLiveSmokeEvidenceReader({
                listMessageLedgerEvents,
                listChannelMessageRefsForRun,
            }),
        }))
        : undefined;
    const defaultChannelSmokeLiveExecutor = createAvailableChannelSmokeLiveExecutor({
        ...(webUiLiveSmokeExecutor ? { webui: webUiLiveSmokeExecutor } : {}),
        ...(telegramLiveSmokeExecutor ? { telegram: telegramLiveSmokeExecutor } : {}),
        ...(slackLiveSmokeExecutor ? { slack: slackLiveSmokeExecutor } : {}),
    });
    const channelSmokeLiveExecutor = runtime.channelSmokeLiveExecutor ?? defaultChannelSmokeLiveExecutor;
    const liveAcceptanceResolution = resolveApiLiveAcceptanceExecutor({
        runtime,
        ...(channelSmokeLiveExecutor ? { channelSmokeLiveExecutor } : {}),
    });
    if (runtime.liveAcceptanceEnabled && liveAcceptanceResolution.status === "unavailable") {
        log.warn(`Live acceptance executor unavailable: ${liveAcceptanceResolution.reasonCode}`);
    }
    const readinessItem = (capability, ready) => ready
        ? Object.freeze({ capability, status: "ready" })
        : Object.freeze({
            capability,
            status: "unavailable",
            reasonCode: capability === "webui"
                ? "live_acceptance_webui_target_unavailable"
                : capability === "telegram"
                    ? "live_acceptance_telegram_target_unavailable"
                    : capability === "slack"
                        ? "live_acceptance_slack_target_unavailable"
                        : "live_acceptance_web_runtime_unavailable",
        });
    const inspectLiveAcceptanceReadiness = () => Object.freeze([
        readinessItem("webui", Boolean(runtime.channelSmokeLiveExecutor ?? webUiLiveSmokeExecutor)),
        readinessItem("telegram", Boolean(runtime.channelSmokeLiveExecutor ?? telegramLiveSmokeExecutor)),
        readinessItem("slack", Boolean(runtime.channelSmokeLiveExecutor ?? slackLiveSmokeExecutor)),
        readinessItem("web", Boolean(runtime.liveAcceptanceExecutor ?? runtime.liveAcceptanceExecutorFactory)),
        ...(runtime.liveAcceptanceSelectionAvailabilityInspector?.() ?? []),
    ]);
    await server.register(cors, { origin: true });
    await server.register(websocketPlugin);
    registerStatusRoute(server, { ...capabilityProjectionOptions, updateRuntime });
    registerYeonjangInstancesRoute(server, {
        mqttConfig: cfg.mqtt,
        ...(runtime.pairingExecutionAdmissionKeyProvisioner
            ? {
                pairingExecutionAdmissionKeyProvisioner: runtime.pairingExecutionAdmissionKeyProvisioner,
            }
            : {}),
    });
    registerBenchmarkRoutes(server);
    registerCapabilitiesRoute(server, capabilityProjectionOptions);
    registerArtifactsRoute(server);
    registerAgentRoutes(server, memoryJournal);
    registerToolsRoute(server);
    registerAuditRoute(server);
    registerSettingsRoute(server);
    registerSetupRoute(server, { mcpProcessEnv: runtime.mcpProcessEnv });
    registerRunsRoute(server, memoryJournal);
    registerSubSessionRoutes(server);
    registerTopologyRoutes(server);
    registerTopologyRunRoutes(server);
    registerTopologyAnalysisRoutes(server);
    registerCommandPaletteRoutes(server);
    registerDataExchangeRoutes(server);
    registerInstructionsRoute(server);
    registerMcpRoute(server, { mcpProcessEnv: runtime.mcpProcessEnv, mutationRuntime: mcpMutationRuntime });
    registerOrchestrationEventsRoute(server);
    registerUpdateRoute(server, updateRuntime);
    registerSchedulesRoute(server, memoryJournal);
    registerSchedulerRoute(server);
    registerPluginsRoute(server);
    registerMemoryRoute(server, cfg);
    registerPromptSourcesRoute(server);
    registerConfigOperationsRoute(server);
    registerChannelsRoute(server);
    registerChannelSmokeRoute(server, {
        liveSmokeEnabled: runtime.channelSmokeLiveEnabled,
        ...(channelSmokeLiveExecutor ? { liveExecutor: channelSmokeLiveExecutor } : {}),
    });
    registerLiveAcceptanceRoute(server, {
        enabled: runtime.liveAcceptanceEnabled,
        ...(liveAcceptanceResolution.status === "ready"
            ? { execute: liveAcceptanceResolution.executor }
            : {}),
        inspectReadiness: inspectLiveAcceptanceReadiness,
        ...(runtime.liveAcceptanceRuntimeIdentityInspector
            ? { inspectRuntimeIdentity: runtime.liveAcceptanceRuntimeIdentityInspector }
            : {}),
        now: Date.now,
    });
    registerDoctorRoute(server);
    registerControlTimelineRoute(server);
    registerUiModeRoute(server, uiModeRuntime);
    registerAdminRoute(server, { uiModeRuntime });
    registerWsRoute(server);
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const webuiDist = join(__dirname, "../../../webui/dist");
    if (existsSync(webuiDist)) {
        await server.register(staticPlugin, {
            root: webuiDist,
            prefix: "/",
        });
        server.setNotFoundHandler(async (req, reply) => {
            const url = req.raw.url ?? "";
            if (url === "/api" || url.startsWith("/api/") || url === "/ws" || url.startsWith("/ws/")) {
                return reply.status(404).send({ error: "Not found" });
            }
            return reply.sendFile("index.html");
        });
    }
    else {
        server.setNotFoundHandler(async (req, reply) => {
            const url = req.raw.url ?? "";
            if (url === "/api" || url.startsWith("/api/") || url === "/ws" || url.startsWith("/ws/")) {
                return reply.status(404).send({ error: "Not found" });
            }
            return reply
                .status(404)
                .send({ error: "WebUI not built. Run: pnpm build --filter @knowbee/webui" });
        });
    }
    const { host, port } = cfg.webui;
    await server.listen({ host, port });
    log.info(`Gateway socket listening on http://${host}:${port}; completing bootstrap`);
    try {
        if (runtime.startupProgress) {
            const bound = await runtime.startupProgress.advance({
                type: "http_bound",
                at: Date.now(),
            });
            if (bound.status === "rejected") {
                throw new Error(`gateway_startup_transition_rejected:${bound.reasonCode}`);
            }
        }
        startArtifactCleanupScheduler({ cleanupEvidence: resolveArtifactCleanupEvidence }, artifactStorage);
        startScheduler(cfg, artifactStorage, memoryJournal, hierarchyStorage);
        await pluginLoader.loadAll({ config: cfg });
    }
    catch (error) {
        if (runtime.startupProgress) {
            await runtime.startupProgress.advance({
                type: "fail",
                at: Date.now(),
                reasonCode: "post_listen_bootstrap_failed",
            });
        }
        else {
            markGatewayFailed("post_listen_bootstrap_failed");
        }
        stopArtifactCleanupScheduler();
        stopScheduler();
        await server.close();
        server = null;
        throw error;
    }
    if (runtime.startupProgress) {
        const ready = await runtime.startupProgress.advance({
            type: "plugins_loaded",
            at: Date.now(),
        });
        if (ready.status === "rejected") {
            throw new Error(`gateway_startup_transition_rejected:${ready.reasonCode}`);
        }
    }
    else {
        markGatewayReady();
    }
    log.info(`Gateway ready on http://${host}:${port}`);
    eventBus.emit("gateway.started", { host, port });
    eventBus.emit("channel.connected", { channel: "webui", detail: { host, port } });
}
export async function closeServer() {
    stopArtifactCleanupScheduler();
    stopScheduler();
    stopActiveSlackChannel();
    stopActiveTelegramChannel();
    closeChannelRuntimeStorage();
    await stopMqttBroker();
    await mcpRegistry.closeAll();
    if (server) {
        await server.close();
        server = null;
        log.info("WebUI server closed");
    }
    apiMemoryJournal?.close();
    apiMemoryJournal = null;
}
//# sourceMappingURL=server.js.map