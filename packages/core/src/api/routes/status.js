import { createHash } from "node:crypto";
import { detectAvailableProvider, getDefaultModel } from "../../ai/index.js";
import { SETUP_INTERNAL_PATH_MASK, createCapabilities, createCapabilityCounts, getPrimaryAiTarget, readSetupState, } from "../../control-plane/index.js";
import { mcpRegistry } from "../../mcp/registry.js";
import { loadPromptSourceRegistry } from "../../memory/knowbee-md.js";
import { getMqttBrokerSnapshot, getMqttExtensionSnapshots } from "../../mqtt/broker.js";
import { getFastResponseHealthSnapshot } from "../../observability/latency.js";
import { resolveOrchestrationModeSnapshotSync } from "../../orchestration/mode.js";
import { getLastStartupRecoverySummary } from "../../runs/startup-recovery.js";
import { getGatewayProcessStartTimeMs, getRuntimeBuildStatus } from "../../runtime/build-status.js";
import { getGatewayReadinessSnapshot } from "../../runtime/gateway-readiness.js";
import { toolDispatcher } from "../../tools/index.js";
import { getCurrentAppVersion, getUpdateSnapshot, } from "../../update/service.js";
import { getCurrentDisplayVersion, getWorkspaceRootPath } from "../../version.js";
import { buildYeonjangBroadcastPolicyProjection } from "../../yeonjang/broadcast-policy.js";
import { buildYeonjangFleetProjection } from "../../yeonjang/topology.js";
import { authMiddleware } from "../middleware/auth.js";
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js";
const startTime = getGatewayProcessStartTimeMs();
const startedAt = new Date(startTime).toISOString();
function redactRuntimeBuildStatusForApi(status) {
    return {
        ...status,
        workspaceRoot: SETUP_INTERNAL_PATH_MASK,
        packages: status.packages.map((pkg) => ({
            ...pkg,
            sourceDir: SETUP_INTERNAL_PATH_MASK,
            distDir: SETUP_INTERNAL_PATH_MASK,
            sourceNewest: pkg.sourceNewest
                ? { ...pkg.sourceNewest, path: SETUP_INTERNAL_PATH_MASK }
                : null,
            distNewest: pkg.distNewest ? { ...pkg.distNewest, path: SETUP_INTERNAL_PATH_MASK } : null,
            missingOutputs: pkg.missingOutputs.map(() => SETUP_INTERNAL_PATH_MASK),
            staleOutputs: pkg.staleOutputs.map((item) => ({
                ...item,
                sourcePath: SETUP_INTERNAL_PATH_MASK,
                outputPath: SETUP_INTERNAL_PATH_MASK,
            })),
        })),
    };
}
function getPromptSourceSnapshot() {
    try {
        const sources = loadPromptSourceRegistry(getWorkspaceRootPath());
        if (sources.length === 0)
            return { count: 0, checksum: null };
        const digest = createHash("sha256");
        for (const source of sources) {
            digest.update(source.sourceId);
            digest.update("\0");
            digest.update(source.locale);
            digest.update("\0");
            digest.update(source.checksum);
            digest.update("\n");
        }
        return { count: sources.length, checksum: digest.digest("hex") };
    }
    catch {
        return { count: 0, checksum: null };
    }
}
export function registerStatusRoute(app, options) {
    const { updateRuntime, ...capabilityOptions } = options;
    app.get("/api/health", async () => ({
        ok: true,
        service: "knowbee-gateway",
        status: "live",
        runtime: {
            pid: process.pid,
        },
    }));
    app.get("/api/ready", async (_req, reply) => {
        const readiness = getGatewayReadinessSnapshot();
        const body = {
            ok: readiness.status === "ready",
            service: "knowbee-gateway",
            status: readiness.status,
            reasonCode: readiness.reasonCode,
            changedAt: readiness.changedAt,
            runtime: {
                pid: process.pid,
            },
        };
        return readiness.status === "ready"
            ? body
            : reply.status(503).send(body);
    });
    app.get("/api/status", { preHandler: authMiddleware }, async (req) => {
        const cfg = getApiRuntimeConfig(req);
        const setupState = readSetupState(getApiRuntimePaths(req));
        const capabilities = createCapabilities({ ...capabilityOptions, config: cfg });
        const orchestrator = capabilities.find((item) => item.key === "gateway.orchestrator");
        const orchestration = resolveOrchestrationModeSnapshotSync({ config: cfg });
        const runtimeBuild = getRuntimeBuildStatus();
        const yeonjangFleet = buildYeonjangFleetProjection();
        const yeonjangBroadcastPolicies = buildYeonjangBroadcastPolicyProjection();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        return {
            version: getCurrentAppVersion(),
            displayVersion: getCurrentDisplayVersion(),
            provider: detectAvailableProvider(cfg),
            model: getDefaultModel(cfg),
            uptime,
            runtime: {
                pid: process.pid,
                ppid: process.ppid,
                cwd: SETUP_INTERNAL_PATH_MASK,
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                startedAt,
                startTimeMs: startTime,
                uptimeSeconds: uptime,
            },
            runtimeBuild: redactRuntimeBuildStatusForApi(runtimeBuild),
            toolCount: toolDispatcher.getAll().length,
            setupCompleted: setupState.completed,
            capabilityCounts: createCapabilityCounts({ ...capabilityOptions, config: cfg }),
            primaryAiTarget: getPrimaryAiTarget(cfg),
            orchestratorStatus: orchestrator
                ? {
                    status: orchestrator.status,
                    reason: orchestrator.reason ?? null,
                    mode: orchestration.mode,
                    reasonCode: orchestration.reasonCode,
                    activeSubAgentCount: orchestration.activeSubAgentCount,
                }
                : { status: "planned", reason: "Gateway orchestrator capability가 없습니다." },
            orchestration,
            startupRecovery: getLastStartupRecoverySummary(),
            fast_response_health: getFastResponseHealthSnapshot(),
            promptSources: getPromptSourceSnapshot(),
            mcp: mcpRegistry.getSummary(),
            mqtt: getMqttBrokerSnapshot(),
            yeonjang: {
                extensions: getMqttExtensionSnapshots().map((snapshot) => ({
                    extensionId: snapshot.extensionId,
                    displayName: snapshot.displayName,
                    state: snapshot.state,
                    message: snapshot.message,
                    version: snapshot.version,
                    protocolVersion: snapshot.protocolVersion ?? null,
                    platform: snapshot.platform ?? snapshot.os ?? null,
                    arch: snapshot.arch ?? null,
                    transport: snapshot.transport ?? [],
                    capabilityHash: snapshot.capabilityHash ?? null,
                    methodCount: snapshot.methods.length,
                    lastSeenAt: snapshot.lastSeenAt,
                    instanceId: snapshot.instanceId ?? null,
                    instanceAlias: snapshot.instanceAlias ?? null,
                    sessionId: snapshot.sessionId ?? null,
                })),
                registry: {
                    summary: yeonjangFleet.summary,
                    instances: yeonjangFleet.instances,
                    diffSummaries: yeonjangFleet.diffSummaries,
                    defaultTarget: yeonjangFleet.summary.defaultTarget,
                    broadcastPolicies: yeonjangBroadcastPolicies,
                },
            },
            paths: {
                stateDir: SETUP_INTERNAL_PATH_MASK,
                configFile: SETUP_INTERNAL_PATH_MASK,
                dbFile: SETUP_INTERNAL_PATH_MASK,
                setupStateFile: SETUP_INTERNAL_PATH_MASK,
            },
            webui: {
                port: cfg.webui.port,
                host: cfg.webui.host,
                authEnabled: cfg.webui.auth.enabled,
            },
            update: (() => {
                const update = getUpdateSnapshot(updateRuntime);
                return {
                    status: update.status,
                    latestVersion: update.latestVersion,
                    checkedAt: update.checkedAt,
                    updateAvailable: update.updateAvailable,
                };
            })(),
        };
    });
}
//# sourceMappingURL=status.js.map