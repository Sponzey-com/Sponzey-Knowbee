const DEFAULT_ROOT_AGENT_ID = "agent:knowbee";
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
function riskForTool(tool) {
    return tool.requiresApproval || tool.riskLevel !== "safe" ? "approval_required" : "safe";
}
function runtimeHealthKey(observation) {
    return `${observation.capabilityId}\u0000${observation.targetId}`;
}
function normalizedRuntimeHealthObservations(observations) {
    if (!observations)
        return undefined;
    const unique = new Map();
    for (const observation of observations) {
        const normalized = {
            capabilityId: observation.capabilityId.trim(),
            targetId: observation.targetId.trim(),
            status: observation.status,
            observedAt: observation.observedAt,
            expiresAt: observation.expiresAt,
            reasonCodes: uniqueStrings(observation.reasonCodes),
        };
        if (!normalized.capabilityId ||
            !normalized.targetId ||
            !Number.isFinite(normalized.observedAt) ||
            !Number.isFinite(normalized.expiresAt) ||
            normalized.observedAt > normalized.expiresAt ||
            (normalized.status === "unavailable" && normalized.reasonCodes.length === 0)) {
            throw new Error("Invalid runtime health observation.");
        }
        const key = runtimeHealthKey(normalized);
        const existing = unique.get(key);
        if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
            throw new Error(`Conflicting runtime health observations for ${key}.`);
        }
        unique.set(key, normalized);
    }
    return [...unique.values()].sort((left, right) => runtimeHealthKey(left).localeCompare(runtimeHealthKey(right)));
}
function fallbackAgentEligibility(agent) {
    const reasonCodes = [];
    if (agent.status !== "enabled")
        reasonCodes.push(`agent_${agent.status}`);
    if (!agent.delegationEnabled)
        reasonCodes.push("delegation_disabled");
    if (agent.currentLoad?.activeSubSessions >= agent.currentLoad?.maxParallelSessions) {
        reasonCodes.push("concurrency_limit_reached");
    }
    if (agent.capabilitySummary?.availability === "unavailable") {
        reasonCodes.push("capability_unavailable");
    }
    if (agent.modelSummary?.availability === "unavailable")
        reasonCodes.push("model_unavailable");
    return { eligible: reasonCodes.length === 0, reasonCodes: uniqueStrings(reasonCodes) };
}
function agentEligibility(registry, agent) {
    const index = registry.capabilityIndex;
    if (!index)
        return fallbackAgentEligibility(agent);
    const candidates = (index.candidatesByAgentId[agent.agentId] ?? []).filter((candidate) => candidate.parentAgentId === index.rootAgentId);
    const eligible = candidates.some((candidate) => candidate.eligible);
    const reasonCodes = uniqueStrings(candidates.flatMap((candidate) => candidate.reasonCodes));
    return {
        eligible,
        reasonCodes: eligible ? [] : reasonCodes.length > 0 ? reasonCodes : ["agent_not_direct_child"],
    };
}
function projectAgentCapabilities(agent) {
    const projected = new Map();
    const add = (candidate) => {
        const capabilityId = candidate.capabilityId.trim();
        if (!capabilityId)
            return;
        const normalized = {
            ...candidate,
            capabilityId,
            reasonCodes: uniqueStrings(candidate.reasonCodes),
        };
        const existing = projected.get(capabilityId);
        if (!existing) {
            projected.set(capabilityId, normalized);
            return;
        }
        const available = existing.available && normalized.available;
        projected.set(capabilityId, {
            capabilityId,
            available,
            reasonCodes: available
                ? []
                : uniqueStrings([...existing.reasonCodes, ...normalized.reasonCodes]),
            risk: existing.risk === "approval_required" || normalized.risk === "approval_required"
                ? "approval_required"
                : "safe",
        });
    };
    const disabledTools = new Set(agent.skillMcpSummary.disabledToolNames);
    const bindings = [
        ...agent.capabilitySummary.skillBindings,
        ...agent.capabilitySummary.mcpServerBindings,
    ];
    for (const binding of bindings) {
        const available = binding.available !== false;
        const bindingReasonCodes = binding.reasonCodes ?? [];
        const reasonCodes = available
            ? []
            : bindingReasonCodes.length > 0
                ? bindingReasonCodes
                : ["capability_binding_unavailable"];
        const risk = binding.risk !== "safe" ? "approval_required" : "safe";
        add({ capabilityId: binding.catalogId, available, reasonCodes, risk });
        for (const toolName of binding.enabledToolNames) {
            const toolDisabled = disabledTools.has(toolName) || (binding.disabledToolNames ?? []).includes(toolName);
            add({
                capabilityId: toolName,
                available: available && !toolDisabled,
                reasonCodes: !available
                    ? reasonCodes
                    : toolDisabled
                        ? ["tool_disabled_by_agent_policy"]
                        : [],
                risk,
            });
        }
    }
    for (const capabilityId of [
        ...agent.skillMcpSummary.enabledSkillIds,
        ...agent.skillMcpSummary.enabledMcpServerIds,
        ...agent.skillMcpSummary.enabledToolNames,
    ]) {
        add({ capabilityId, available: true, reasonCodes: [], risk: "safe" });
    }
    for (const capabilityId of [
        ...(agent.capabilitySummary.disabledSkillIds ?? []),
        ...(agent.capabilitySummary.disabledMcpServerIds ?? []),
    ]) {
        if (!projected.has(capabilityId)) {
            add({
                capabilityId,
                available: false,
                reasonCodes: ["capability_binding_unavailable"],
                risk: "safe",
            });
        }
    }
    for (const capabilityId of disabledTools) {
        if (!projected.has(capabilityId)) {
            add({
                capabilityId,
                available: false,
                reasonCodes: ["tool_disabled_by_agent_policy"],
                risk: "safe",
            });
        }
    }
    return [...projected.values()].sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
}
export function projectCanonicalCapabilitySnapshot(input) {
    const bindings = [];
    const exclusions = [];
    const healthObservations = normalizedRuntimeHealthObservations(input.runtimeHealthObservations);
    const snapshotAt = input.snapshotAt ?? input.registry.generatedAt;
    const rootAgentId = input.rootAgentId?.trim() || DEFAULT_ROOT_AGENT_ID;
    for (const capabilityId of uniqueStrings(input.actionCapabilityIds)) {
        bindings.push({ capabilityId, targetId: rootAgentId, risk: "safe" });
    }
    for (const tool of input.tools) {
        const capabilityId = tool.name.trim();
        if (!capabilityId)
            continue;
        if (input.source && tool.availableSources && !tool.availableSources.includes(input.source)) {
            exclusions.push({
                capabilityId,
                targetId: rootAgentId,
                reasonCodes: ["tool_source_unsupported"],
            });
            continue;
        }
        if (healthObservations &&
            (tool.evidenceSourceKind === "mcp" || tool.runtimeHealthMode !== undefined)) {
            const matching = healthObservations.filter((observation) => observation.capabilityId === capabilityId);
            if (tool.runtimeHealthMode === "additional") {
                bindings.push({ capabilityId, targetId: rootAgentId, risk: riskForTool(tool) });
            }
            if (matching.length === 0) {
                if (tool.runtimeHealthMode === "additional")
                    continue;
                exclusions.push({
                    capabilityId,
                    targetId: rootAgentId,
                    reasonCodes: ["runtime_health_observation_missing"],
                });
                continue;
            }
            for (const observation of matching) {
                if (snapshotAt > observation.expiresAt) {
                    exclusions.push({
                        capabilityId,
                        targetId: observation.targetId,
                        reasonCodes: ["runtime_health_observation_stale"],
                    });
                }
                else if (observation.status === "unavailable") {
                    exclusions.push({
                        capabilityId,
                        targetId: observation.targetId,
                        reasonCodes: observation.reasonCodes,
                    });
                }
                else {
                    bindings.push({
                        capabilityId,
                        targetId: observation.targetId,
                        risk: riskForTool(tool),
                    });
                }
            }
            continue;
        }
        bindings.push({ capabilityId, targetId: rootAgentId, risk: riskForTool(tool) });
    }
    for (const agent of input.registry.agents) {
        const eligibility = agentEligibility(input.registry, agent);
        for (const capability of projectAgentCapabilities(agent)) {
            if (eligibility.eligible && capability.available) {
                bindings.push({
                    capabilityId: capability.capabilityId,
                    targetId: agent.agentId,
                    risk: capability.risk,
                });
            }
            else {
                exclusions.push({
                    capabilityId: capability.capabilityId,
                    targetId: agent.agentId,
                    reasonCodes: capability.available
                        ? eligibility.reasonCodes
                        : uniqueStrings([...capability.reasonCodes, ...eligibility.reasonCodes]),
                });
            }
        }
    }
    const toolsByName = new Map(input.tools.map((tool) => [tool.name.trim(), tool]));
    const agentById = new Map(input.registry.agents.map((agent) => [agent.agentId, agent]));
    const projectedYeonjangBindings = new Map();
    for (const binding of input.yeonjangAgentBindings ?? []) {
        const agentId = binding.agentId.trim();
        const targetId = binding.targetId.trim();
        if (!agentId || !targetId.startsWith("yeonjang:"))
            continue;
        const matching = (healthObservations ?? []).filter((observation) => observation.targetId === targetId);
        for (const observation of matching) {
            const key = `${observation.capabilityId}\u0000${agentId}`;
            const stale = snapshotAt > observation.expiresAt;
            const ready = observation.status === "ready" && !stale;
            const reasonCodes = ready
                ? []
                : stale
                    ? ["runtime_health_observation_stale"]
                    : observation.reasonCodes.length > 0
                        ? observation.reasonCodes
                        : ["runtime_health_observation_unavailable"];
            const existing = projectedYeonjangBindings.get(key);
            projectedYeonjangBindings.set(key, {
                capabilityId: observation.capabilityId,
                agentId,
                ready: (existing?.ready ?? false) || ready,
                reasonCodes: uniqueStrings([...(existing?.reasonCodes ?? []), ...reasonCodes]),
            });
        }
    }
    for (const projection of projectedYeonjangBindings.values()) {
        const agent = agentById.get(projection.agentId);
        const eligibility = agent
            ? agentEligibility(input.registry, agent)
            : { eligible: false, reasonCodes: ["agent_not_registered"] };
        if (projection.ready && eligibility.eligible) {
            const tool = toolsByName.get(projection.capabilityId);
            bindings.push({
                capabilityId: projection.capabilityId,
                targetId: projection.agentId,
                risk: tool ? riskForTool(tool) : "approval_required",
            });
        }
        else {
            exclusions.push({
                capabilityId: projection.capabilityId,
                targetId: projection.agentId,
                reasonCodes: uniqueStrings([
                    ...(projection.ready ? [] : projection.reasonCodes),
                    ...eligibility.reasonCodes,
                ]),
            });
        }
    }
    const uniqueBindings = new Map();
    for (const binding of bindings) {
        uniqueBindings.set(`${binding.capabilityId}\u0000${binding.targetId}`, binding);
    }
    const uniqueExclusions = new Map();
    for (const exclusion of exclusions) {
        uniqueExclusions.set(`${exclusion.capabilityId}\u0000${exclusion.targetId}`, exclusion);
    }
    const byIdentity = (left, right) => `${left.capabilityId}\u0000${left.targetId}`.localeCompare(`${right.capabilityId}\u0000${right.targetId}`);
    return {
        bindings: [...uniqueBindings.values()].sort(byIdentity),
        exclusions: [...uniqueExclusions.values()].sort(byIdentity),
    };
}
//# sourceMappingURL=canonical-capability-snapshot.js.map