import { listAgentConfigs } from "../db/index.js";
import { resolveAgentConfigAgentName, } from "../contracts/sub-agent-orchestration.js";
import { createLegacyTopologyRegistry, legacyTopologyEnvelopeToExecutorCompatibilityEnvelope, } from "../topology/legacy-enterprise-topology-adapter.js";
import { redactLogText } from "../logger/index.js";
import { DEFAULT_MAIN_AGENT_NAME_KO } from "../agent/main-agent-identity.js";
function requestedModeFromConfig(config) {
    return config.mode ?? "single_knowbee";
}
function isOrchestrationFeatureEnabled(config) {
    return config.featureFlagEnabled === true && requestedModeFromConfig(config) === "orchestration";
}
function normalizedMainAgentNameSnapshot(value) {
    return value?.trim() || DEFAULT_MAIN_AGENT_NAME_KO;
}
function directMainAgentModeLabel(mainAgentNameSnapshot) {
    return `${normalizedMainAgentNameSnapshot(mainAgentNameSnapshot)} 직접 처리 모드`;
}
function orchestrationModeErrorDetail(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
function configSubAgentSnapshot(agent) {
    const agentName = resolveAgentConfigAgentName(agent);
    return {
        agentId: agent.agentId,
        agentName,
        source: "config",
    };
}
function dbAgentNameSnapshot(agent) {
    try {
        const parsed = JSON.parse(agent.config_json);
        const agentName = typeof parsed.agentName === "string" ? parsed.agentName : undefined;
        return resolveAgentConfigAgentName(agentName ? { agentType: "sub_agent", agentName } : { agentType: "sub_agent" });
    }
    catch {
        return resolveAgentConfigAgentName({ agentType: "sub_agent" });
    }
}
function dbSubAgentSnapshot(agent) {
    return {
        agentId: agent.agent_id,
        agentName: dbAgentNameSnapshot(agent),
        source: "db",
    };
}
function dbDelegationEnabled(agent) {
    try {
        const parsed = JSON.parse(agent.config_json);
        return parsed.delegation?.enabled !== false;
    }
    catch {
        return true;
    }
}
function timestampMs(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function topologyAgentId(topologyId, executorId) {
    return `${topologyId}:${executorId}`;
}
function topologyExecutorCandidates() {
    const registry = createLegacyTopologyRegistry();
    const topologies = registry
        .listTopologies()
        .filter((topology) => topology.status !== "archived")
        .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt) || a.topologyId.localeCompare(b.topologyId));
    const candidates = [];
    for (const topologyRecord of topologies) {
        const exported = registry.exportTopology(topologyRecord.topologyId);
        if (!exported)
            continue;
        const adapted = legacyTopologyEnvelopeToExecutorCompatibilityEnvelope(exported);
        for (const node of adapted.envelope.version.topology.nodes) {
            if (node.status === "archived")
                continue;
            const agentName = node.displayName?.trim() || node.name.trim();
            if (!agentName)
                continue;
            candidates.push({
                snapshot: {
                    agentId: topologyAgentId(topologyRecord.topologyId, node.id),
                    agentName,
                    topologyId: topologyRecord.topologyId,
                    executorId: node.id,
                    source: "topology",
                },
                active: true,
            });
        }
    }
    return candidates;
}
function mergeRegistryCandidates(...candidateGroups) {
    const merged = new Map();
    for (const candidates of candidateGroups) {
        for (const agent of candidates)
            merged.set(agent.snapshot.agentId, agent);
    }
    return [...merged.values()].sort((a, b) => a.snapshot.agentId.localeCompare(b.snapshot.agentId));
}
function defaultRegistryLoad(config) {
    const topologyAgents = topologyExecutorCandidates();
    const dbAgents = listAgentConfigs({ includeArchived: false, agentType: "sub_agent" }).map((agent) => ({
        snapshot: dbSubAgentSnapshot(agent),
        active: agent.status === "enabled" && dbDelegationEnabled(agent),
    }));
    const existingAgentIds = new Set([
        ...topologyAgents.map((agent) => agent.snapshot.agentId),
        ...dbAgents.map((agent) => agent.snapshot.agentId),
    ]);
    const configAgents = (config.subAgents ?? [])
        .filter((agent) => !existingAgentIds.has(agent.agentId))
        .map((agent) => ({
        snapshot: configSubAgentSnapshot(agent),
        active: agent.status === "enabled" && agent.delegation.enabled,
    }));
    const candidates = mergeRegistryCandidates(configAgents, dbAgents, topologyAgents);
    const activeSubAgents = candidates
        .filter((agent) => agent.active)
        .map((agent) => agent.snapshot);
    return {
        activeSubAgents,
        totalSubAgentCount: candidates.length,
        disabledSubAgentCount: candidates.length - activeSubAgents.length,
    };
}
function buildSnapshot(input) {
    const activeSubAgents = input.activeSubAgents ?? [];
    const mainAgentNameSnapshot = normalizedMainAgentNameSnapshot(input.mainAgentNameSnapshot);
    return {
        mode: input.mode,
        status: input.status,
        featureFlagEnabled: input.config.featureFlagEnabled === true,
        requestedMode: requestedModeFromConfig(input.config),
        mainAgentNameSnapshot,
        activeSubAgentCount: activeSubAgents.length,
        totalSubAgentCount: input.totalSubAgentCount ?? activeSubAgents.length,
        disabledSubAgentCount: input.disabledSubAgentCount ?? 0,
        activeSubAgents,
        reasonCode: input.reasonCode,
        reason: input.reason,
        generatedAt: input.generatedAt,
    };
}
function timeoutSnapshot(config, generatedAt, mainAgentNameSnapshot) {
    return buildSnapshot({
        mode: "single_knowbee",
        status: "degraded",
        config,
        reasonCode: "registry_load_timeout",
        reason: `서브 에이전트 설정 조회가 시간 내 완료되지 않아 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 fallback했습니다.`,
        mainAgentNameSnapshot,
        generatedAt,
    });
}
function registryErrorSnapshot(config, generatedAt, error, mainAgentNameSnapshot) {
    const detail = orchestrationModeErrorDetail(error);
    return buildSnapshot({
        mode: "single_knowbee",
        status: "degraded",
        config,
        reasonCode: "registry_load_failed",
        reason: `서브 에이전트 설정 조회에 실패해 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 fallback했습니다: ${detail}`,
        mainAgentNameSnapshot,
        generatedAt,
    });
}
function snapshotFromRegistry(config, generatedAt, registry, mainAgentNameSnapshot) {
    if (registry.activeSubAgents.length === 0) {
        return buildSnapshot({
            mode: "single_knowbee",
            status: "ready",
            config,
            activeSubAgents: [],
            totalSubAgentCount: registry.totalSubAgentCount,
            disabledSubAgentCount: registry.disabledSubAgentCount,
            reasonCode: "no_active_sub_agents",
            reason: registry.totalSubAgentCount > 0
                ? `활성화된 서브 에이전트가 없어 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 동작합니다.`
                : `저장된 서브 에이전트가 없어 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 동작합니다.`,
            mainAgentNameSnapshot,
            generatedAt,
        });
    }
    return buildSnapshot({
        mode: "orchestration",
        status: "ready",
        config,
        activeSubAgents: registry.activeSubAgents,
        totalSubAgentCount: registry.totalSubAgentCount,
        disabledSubAgentCount: registry.disabledSubAgentCount,
        reasonCode: "orchestration_ready",
        reason: `서브 에이전트 ${registry.activeSubAgents.length}개가 준비되어 위임 실행 모드로 동작할 수 있습니다.`,
        mainAgentNameSnapshot,
        generatedAt,
    });
}
function snapshotBeforeRegistry(config, generatedAt, mainAgentNameSnapshot) {
    const requestedMode = requestedModeFromConfig(config);
    if (requestedMode !== "orchestration") {
        return buildSnapshot({
            mode: "single_knowbee",
            status: "ready",
            config,
            reasonCode: "mode_single_knowbee",
            reason: `설정 모드가 single_knowbee이므로 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 동작합니다.`,
            mainAgentNameSnapshot,
            generatedAt,
        });
    }
    if (!isOrchestrationFeatureEnabled(config)) {
        return buildSnapshot({
            mode: "single_knowbee",
            status: "ready",
            config,
            reasonCode: "feature_flag_off",
            reason: `orchestration feature flag가 꺼져 있어 ${directMainAgentModeLabel(mainAgentNameSnapshot)}로 동작합니다.`,
            mainAgentNameSnapshot,
            generatedAt,
        });
    }
    return undefined;
}
export function resolveOrchestrationModeSnapshotSync(dependencies) {
    const config = dependencies.config.orchestration;
    const generatedAt = dependencies.now?.() ?? Date.now();
    const preRegistrySnapshot = snapshotBeforeRegistry(config, generatedAt, dependencies.mainAgentNameSnapshot);
    if (preRegistrySnapshot)
        return preRegistrySnapshot;
    try {
        const loadRegistry = dependencies.loadRegistry ?? (() => defaultRegistryLoad(config));
        return snapshotFromRegistry(config, generatedAt, loadRegistry(), dependencies.mainAgentNameSnapshot);
    }
    catch (error) {
        return registryErrorSnapshot(config, generatedAt, error, dependencies.mainAgentNameSnapshot);
    }
}
export async function resolveOrchestrationModeSnapshot(dependencies) {
    const config = dependencies.config.orchestration;
    const generatedAt = dependencies.now?.() ?? Date.now();
    const preRegistrySnapshot = snapshotBeforeRegistry(config, generatedAt, dependencies.mainAgentNameSnapshot);
    if (preRegistrySnapshot)
        return preRegistrySnapshot;
    try {
        const loadRegistry = dependencies.loadRegistry ?? (() => defaultRegistryLoad(config));
        const registryPromise = Promise.resolve(loadRegistry());
        const timeoutMs = Math.max(1, dependencies.timeoutMs ?? 100);
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve("timeout"), timeoutMs);
        });
        const result = await Promise.race([registryPromise, timeoutPromise]);
        if (result === "timeout")
            return timeoutSnapshot(config, generatedAt, dependencies.mainAgentNameSnapshot);
        return snapshotFromRegistry(config, generatedAt, result, dependencies.mainAgentNameSnapshot);
    }
    catch (error) {
        return registryErrorSnapshot(config, generatedAt, error, dependencies.mainAgentNameSnapshot);
    }
}
export function orchestrationCapabilityStatus(snapshot) {
    if (snapshot.status === "degraded")
        return { status: "error", enabled: false };
    if (snapshot.mode === "orchestration")
        return { status: "ready", enabled: true };
    return { status: "ready", enabled: false };
}
//# sourceMappingURL=mode.js.map