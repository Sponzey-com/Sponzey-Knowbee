const RESERVED_ROOT_NAMES = new Set(["nobie", "노비"]);
function cleanText(value) {
    return value?.trim() ?? "";
}
function normalizeName(value) {
    return cleanText(value).toLocaleLowerCase("ko-KR");
}
function preferredDisplayLabel(agent) {
    return cleanText(agent.nickname) || cleanText(agent.displayName) || agent.agentId;
}
function isReservedRootName(value) {
    return RESERVED_ROOT_NAMES.has(normalizeName(value));
}
function conflictsWithRootName(value, rootAgent) {
    const normalized = normalizeName(value);
    if (!normalized) {
        return false;
    }
    return normalized === normalizeName(rootAgent.displayName) || normalized === normalizeName(rootAgent.nickname);
}
function activeParentChildRelationships(relationships) {
    return relationships.filter((relationship) => relationship.relationshipType === "parent_child" && relationship.status === "active");
}
function directChildIds(parentAgentId, relationships) {
    return activeParentChildRelationships(relationships)
        .filter((relationship) => relationship.parentAgentId === parentAgentId)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.childAgentId.localeCompare(right.childAgentId))
        .map((relationship) => relationship.childAgentId);
}
function parentIdFor(agentId, relationships) {
    return activeParentChildRelationships(relationships).find((relationship) => relationship.childAgentId === agentId)
        ?.parentAgentId;
}
function displayNameForAgent(agentId, rootAgent, agents) {
    if (!agentId) {
        return undefined;
    }
    if (agentId === rootAgent.agentId) {
        return cleanText(rootAgent.nickname) || cleanText(rootAgent.displayName) || rootAgent.agentId;
    }
    const agent = agents.find((candidate) => candidate.agentId === agentId);
    return agent ? preferredDisplayLabel(agent) : agentId;
}
function isTopLevelAgent(agentId, rootAgent, relationships) {
    return activeParentChildRelationships(relationships).some((relationship) => relationship.parentAgentId === rootAgent.agentId && relationship.childAgentId === agentId);
}
function stringSet(values) {
    return values ? new Set(values) : undefined;
}
function missingFromCatalog(values, catalogValues) {
    if (!catalogValues) {
        return [];
    }
    const catalog = stringSet(catalogValues);
    return values.filter((value) => !catalog?.has(value));
}
function modelCatalogId(model) {
    return `${model.providerId}:${model.modelId}`;
}
function pushIssue(issues, path, code, message) {
    issues.push({ path, code, message });
}
function buildReadinessItem(dimension, state, label, reasonCodes = []) {
    return { dimension, state, label, reasonCodes };
}
function buildReadiness(agent, input) {
    const directChildren = directChildIds(agent.agentId, input.relationships);
    const missingSkillIds = missingFromCatalog(agent.capabilityPolicy.skillMcpAllowlist.enabledSkillIds, input.catalogs?.skillIds);
    const missingMcpServerIds = missingFromCatalog(agent.capabilityPolicy.skillMcpAllowlist.enabledMcpServerIds, input.catalogs?.mcpServerIds);
    const modelMissing = agent.modelProfile && input.catalogs?.modelIds
        ? !input.catalogs.modelIds.includes(modelCatalogId(agent.modelProfile))
        : false;
    const duplicateNickname = hasDuplicateNickname(agent, input.agents);
    const memoryScopedToAgent = isMemoryScopedToAgent(agent.agentId, agent.memoryPolicy);
    const active = input.runtime?.activeAgentIds?.includes(agent.agentId) ?? false;
    const items = [
        buildReadinessItem("identity", cleanText(agent.displayName) && !duplicateNickname && !isReservedRootName(agent.displayName) && !isReservedRootName(agent.nickname)
            ? "ready"
            : "blocked", "Identity", [
            ...(cleanText(agent.displayName) ? [] : ["display_name_required"]),
            ...(duplicateNickname ? ["nickname_duplicate"] : []),
            ...(isReservedRootName(agent.displayName) || isReservedRootName(agent.nickname) ? ["reserved_nobie_name"] : []),
        ]),
        buildReadinessItem("model", modelMissing ? "blocked" : "ready", agent.modelProfile ? "Model override" : "Inherited model", modelMissing ? ["model_id_missing"] : []),
        buildReadinessItem("skill_mcp", missingSkillIds.length > 0 || missingMcpServerIds.length > 0 ? "blocked" : "ready", "Skill and MCP", [
            ...missingSkillIds.map((id) => `missing_skill:${id}`),
            ...missingMcpServerIds.map((id) => `missing_mcp:${id}`),
        ]),
        buildReadinessItem("memory", memoryScopedToAgent ? "ready" : "blocked", "Memory isolation", memoryScopedToAgent ? [] : ["memory_owner_scope_mismatch"]),
        buildReadinessItem("permission", agent.capabilityPolicy.permissionProfile.allowShellExecution ||
            agent.capabilityPolicy.permissionProfile.allowScreenControl ||
            agent.capabilityPolicy.permissionProfile.riskCeiling === "dangerous"
            ? "needs_attention"
            : "ready", "Permission boundary", agent.capabilityPolicy.permissionProfile.allowShellExecution ||
            agent.capabilityPolicy.permissionProfile.allowScreenControl ||
            agent.capabilityPolicy.permissionProfile.riskCeiling === "dangerous"
            ? ["permission_review_required"]
            : []),
        buildReadinessItem("delegation", agent.delegation.enabled && directChildren.length === 0 ? "idle" : "ready", "Delegation"),
        buildReadinessItem("monitoring", active ? "ready" : "idle", active ? "Runtime active" : "Not running"),
    ];
    const blockedCount = items.filter((item) => item.state === "blocked").length;
    const warningCount = items.filter((item) => item.state === "needs_attention").length;
    const state = blockedCount > 0 ? "blocked" : warningCount > 0 ? "needs_attention" : "ready";
    return {
        state,
        items,
        warningCount,
        blockedCount,
        reasonCodes: items.flatMap((item) => item.reasonCodes),
    };
}
function hasDuplicateNickname(agent, agents) {
    const normalized = normalizeName(agent.nickname);
    if (!normalized) {
        return false;
    }
    return agents.some((candidate) => candidate.agentId !== agent.agentId &&
        candidate.status !== "archived" &&
        normalizeName(candidate.nickname) === normalized);
}
function ownerMatchesAgent(agentId, scope) {
    return scope.ownerType === "sub_agent" && scope.ownerId === agentId;
}
function isMemoryScopedToAgent(agentId, memoryPolicy) {
    return (ownerMatchesAgent(agentId, memoryPolicy.owner) &&
        ownerMatchesAgent(agentId, memoryPolicy.writeScope) &&
        memoryPolicy.readScopes.every((scope) => ownerMatchesAgent(agentId, scope)));
}
function lifecycleForAgent(agent, runtime) {
    if (agent.status === "archived") {
        return "archived";
    }
    if (agent.status === "degraded") {
        return "degraded";
    }
    if (runtime?.activeAgentIds?.includes(agent.agentId)) {
        return "runtime_active";
    }
    return "saved";
}
function driftFromSaved(saved, runtimeAgent) {
    if (!saved || !runtimeAgent) {
        return false;
    }
    return (saved.profileVersion !== runtimeAgent.profileVersion ||
        saved.displayName !== runtimeAgent.displayName ||
        saved.nickname !== runtimeAgent.nickname);
}
function buildSummaryView(agent, input) {
    const parentAgentId = parentIdFor(agent.agentId, input.relationships);
    const readiness = buildReadiness(agent, input);
    const lifecycleState = input.lifecycleState ?? lifecycleForAgent(agent, input.runtime);
    return {
        id: agent.agentId,
        displayName: agent.displayName,
        nickname: agent.nickname,
        displayLabel: preferredDisplayLabel(agent),
        attributionLabel: preferredDisplayLabel(agent),
        role: agent.role,
        description: agent.personality,
        parentDisplayName: displayNameForAgent(parentAgentId, input.rootAgent, input.agents),
        childCount: directChildIds(agent.agentId, input.relationships).length,
        isTopLevel: isTopLevelAgent(agent.agentId, input.rootAgent, input.relationships),
        lifecycleState,
        readinessState: readiness.state,
        lastPublishedAt: agent.updatedAt,
        lastRuntimeSeenAt: input.runtime?.lastSeenAtByAgentId?.[agent.agentId],
        readiness,
    };
}
function toBeginnerCard(summary, agent) {
    const permission = agent.capabilityPolicy.permissionProfile;
    const safePermissionState = summary.readiness.blockedCount > 0
        ? "blocked"
        : permission.allowShellExecution || permission.allowScreenControl || permission.riskCeiling === "dangerous"
            ? "needs_review"
            : "safe";
    const skillCount = agent.capabilityPolicy.skillMcpAllowlist.enabledSkillIds.length;
    const mcpCount = agent.capabilityPolicy.skillMcpAllowlist.enabledMcpServerIds.length;
    return {
        ...summary,
        safePermissionState,
        skillMcpSummary: `${skillCount} skills, ${mcpCount} MCP servers`,
        lastStateLabel: stateLabelForSummary(summary),
    };
}
function stateLabelForSummary(summary) {
    if (summary.lifecycleState === "archived") {
        return "archived";
    }
    if (summary.lifecycleState === "runtime_active") {
        return "running";
    }
    if (summary.lifecycleState === "runtime_drift") {
        return "runtime_drift";
    }
    return "saved";
}
function buildSummaryCounts(rootAgent, agents) {
    return {
        rootDisplayName: cleanText(rootAgent.nickname) || cleanText(rootAgent.displayName) || rootAgent.agentId,
        topLevelAgentCount: agents.filter((agent) => agent.isTopLevel).length,
        totalAgentCount: agents.length,
        readyAgentCount: agents.filter((agent) => agent.readinessState === "ready").length,
        needsAttentionCount: agents.filter((agent) => agent.readinessState === "needs_attention").length,
        blockedAgentCount: agents.filter((agent) => agent.readinessState === "blocked").length,
    };
}
function sortAgentsByTopology(agents, rootAgent, relationships) {
    const topLevel = new Set(directChildIds(rootAgent.agentId, relationships));
    return [...agents].sort((left, right) => {
        const leftTop = topLevel.has(left.agentId);
        const rightTop = topLevel.has(right.agentId);
        if (leftTop !== rightTop) {
            return leftTop ? -1 : 1;
        }
        return left.displayName.localeCompare(right.displayName) || left.agentId.localeCompare(right.agentId);
    });
}
export function buildBeginnerSubAgentSetupView(input) {
    const savedAgents = sortAgentsByTopology(input.savedAgents.filter((agent) => agent.status !== "archived"), input.rootAgent, input.relationships);
    const summaries = savedAgents.map((agent) => buildSummaryView(agent, {
        rootAgent: input.rootAgent,
        agents: input.savedAgents,
        relationships: input.relationships,
        catalogs: input.catalogs,
        runtime: input.runtime,
    }));
    const summary = buildSummaryCounts(input.rootAgent, summaries);
    const status = summaries.length === 0
        ? "empty"
        : summary.blockedAgentCount > 0
            ? "blocked"
            : summary.needsAttentionCount > 0
                ? "needs_attention"
                : "ready";
    return {
        orchestrationMode: savedAgents.length > 0 ? "orchestration" : "single_nobie",
        summary,
        cards: summaries.map((summaryView) => {
            const agent = savedAgents.find((candidate) => candidate.agentId === summaryView.id);
            if (!agent) {
                throw new Error(`Missing agent for summary ${summaryView.id}`);
            }
            return toBeginnerCard(summaryView, agent);
        }),
        primaryAction: status === "empty"
            ? "create_first_sub_agent"
            : status === "blocked" || status === "needs_attention"
                ? "review_attention"
                : "manage_agents",
        status,
    };
}
function buildAdvancedDetail(agent, summary, input) {
    const allowlist = agent.capabilityPolicy.skillMcpAllowlist;
    const directChildren = directChildIds(agent.agentId, input.relationships);
    return {
        summary,
        identity: {
            agentId: agent.agentId,
            displayName: agent.displayName,
            nickname: agent.nickname,
            displayLabel: summary.displayLabel,
            attributionLabel: summary.attributionLabel,
            role: agent.role,
            description: agent.personality,
            specialtyTags: agent.specialtyTags,
            avoidTasks: agent.avoidTasks,
        },
        model: agent.modelProfile
            ? {
                mode: "override",
                providerId: agent.modelProfile.providerId,
                modelId: agent.modelProfile.modelId,
                fallbackModelId: agent.modelProfile.fallbackModelId,
                effort: agent.modelProfile.effort,
                maxOutputTokens: agent.modelProfile.maxOutputTokens,
                costBudget: agent.modelProfile.costBudget,
            }
            : { mode: "inherit" },
        skillMcp: {
            ...allowlist,
            missingSkillIds: missingFromCatalog(allowlist.enabledSkillIds, input.catalogs?.skillIds),
            missingMcpServerIds: missingFromCatalog(allowlist.enabledMcpServerIds, input.catalogs?.mcpServerIds),
        },
        memory: {
            ownerType: agent.memoryPolicy.owner.ownerType,
            ownerId: agent.memoryPolicy.owner.ownerId,
            visibility: agent.memoryPolicy.visibility,
            readScopes: agent.memoryPolicy.readScopes,
            writeScope: agent.memoryPolicy.writeScope,
            retentionPolicy: agent.memoryPolicy.retentionPolicy,
            writebackReviewRequired: agent.memoryPolicy.writebackReviewRequired,
        },
        capability: {
            permissionProfile: agent.capabilityPolicy.permissionProfile,
            riskCeiling: agent.capabilityPolicy.permissionProfile.riskCeiling,
            approvalRequiredFrom: agent.capabilityPolicy.permissionProfile.approvalRequiredFrom,
            enabledSkillIds: allowlist.enabledSkillIds,
            enabledMcpServerIds: allowlist.enabledMcpServerIds,
            enabledToolNames: allowlist.enabledToolNames,
            disabledToolNames: allowlist.disabledToolNames,
            maxConcurrentCalls: agent.capabilityPolicy.rateLimit.maxConcurrentCalls,
            maxCallsPerMinute: agent.capabilityPolicy.rateLimit.maxCallsPerMinute,
        },
        delegation: {
            canDelegate: agent.delegation.enabled,
            directChildOnly: true,
            maxParallelSessions: agent.delegation.maxParallelSessions,
            directChildAgentIds: directChildren,
            allowedChildAgentIds: directChildren,
            resultReviewRequired: true,
            redelegationAllowed: agent.delegation.enabled,
        },
        monitoring: {
            lifecycleState: summary.lifecycleState,
            readiness: summary.readiness,
            lastRuntimeSeenAt: summary.lastRuntimeSeenAt,
            activeVersion: input.runtime?.activeVersionByAgentId?.[agent.agentId],
            driftFromSaved: false,
        },
    };
}
export function buildAdvancedSubAgentSettingsView(input) {
    const sortedAgents = sortAgentsByTopology(input.savedAgents, input.rootAgent, input.relationships);
    const summaries = sortedAgents.map((agent) => buildSummaryView(agent, {
        rootAgent: input.rootAgent,
        agents: input.savedAgents,
        relationships: input.relationships,
        catalogs: input.catalogs,
        runtime: input.runtime,
    }));
    const agents = summaries.map((summary) => ({
        ...summary,
        warningCount: summary.readiness.warningCount,
        blockedCount: summary.readiness.blockedCount,
    }));
    const selectedAgentId = input.selectedAgentId ?? sortedAgents[0]?.agentId;
    const selectedAgent = sortedAgents.find((agent) => agent.agentId === selectedAgentId);
    const selectedSummary = summaries.find((summary) => summary.id === selectedAgentId);
    return {
        orchestrationSummary: buildSummaryCounts(input.rootAgent, summaries),
        agents,
        selectedAgent: selectedAgent && selectedSummary ? buildAdvancedDetail(selectedAgent, selectedSummary, input) : undefined,
    };
}
export function buildSubAgentStateProjection(input) {
    const baseAgent = input.draftAgent ?? input.savedAgent ?? input.runtimeActiveAgent;
    if (!baseAgent) {
        throw new Error("At least one draft, saved, or runtime active sub-agent is required.");
    }
    const agents = [input.draftAgent, input.savedAgent, input.runtimeActiveAgent].filter((agent) => Boolean(agent));
    const runtimeDrift = driftFromSaved(input.savedAgent, input.runtimeActiveAgent);
    const buildSnapshot = (agent, source) => ({
        ...buildSummaryView(agent, {
            rootAgent: input.rootAgent,
            agents,
            relationships: input.relationships,
            catalogs: input.catalogs,
            runtime: input.runtime,
            lifecycleState: source === "draft"
                ? "draft"
                : source === "runtime_active"
                    ? runtimeDrift
                        ? "runtime_drift"
                        : "runtime_active"
                    : lifecycleForAgent(agent, input.runtime),
        }),
        source,
        driftFromSaved: source === "runtime_active" ? runtimeDrift : false,
    });
    const draft = input.draftAgent ? buildSnapshot(input.draftAgent, "draft") : undefined;
    const saved = input.savedAgent ? buildSnapshot(input.savedAgent, "saved") : undefined;
    const runtimeActive = input.runtimeActiveAgent ? buildSnapshot(input.runtimeActiveAgent, "runtime_active") : undefined;
    const stateLabel = draft && saved && !sameSavedShape(draft, saved)
        ? "unsaved_changes"
        : draft && !saved
            ? "draft_only"
            : runtimeDrift
                ? "runtime_drift"
                : runtimeActive
                    ? "running"
                    : saved
                        ? saved.lifecycleState === "archived"
                            ? "archived"
                            : "pending_runtime_activation"
                        : "draft_only";
    return {
        agentId: baseAgent.agentId,
        stateLabel,
        draft,
        saved,
        runtimeActive,
    };
}
function sameSavedShape(left, right) {
    return (left.displayName === right.displayName &&
        left.nickname === right.nickname &&
        left.role === right.role &&
        left.description === right.description);
}
function validateAgentExists(command, context, issues) {
    const agent = context.agents.find((candidate) => candidate.agentId === command.agentId);
    if (!agent) {
        pushIssue(issues, "agentId", "agent_missing", "The target sub-agent does not exist.");
    }
    return agent;
}
function validateIdentityNameSet(values, rootAgent, issues) {
    for (const value of values) {
        if (isReservedRootName(value.value) || conflictsWithRootName(value.value, rootAgent)) {
            pushIssue(issues, value.path, "reserved_nobie_name", "Only the root agent may use the Nobie name.");
        }
    }
}
function validateNicknameUnique(agentId, nickname, context, issues) {
    const normalized = normalizeName(nickname);
    if (!normalized) {
        return;
    }
    const duplicate = context.agents.find((agent) => agent.agentId !== agentId && agent.status !== "archived" && normalizeName(agent.nickname) === normalized);
    if (duplicate) {
        pushIssue(issues, "nickname", "nickname_duplicate", "Sub-agent nicknames must be unique.");
    }
}
function validateAttributionLabelUnique(agentId, attributionLabel, context, issues) {
    const normalized = normalizeName(attributionLabel);
    if (!normalized) {
        pushIssue(issues, "attributionLabel", "attribution_label_required", "A user-facing attribution label is required.");
        return;
    }
    const duplicate = context.agents.find((agent) => {
        if (agent.agentId === agentId || agent.status === "archived")
            return false;
        return normalizeName(preferredDisplayLabel(agent)) === normalized;
    });
    if (duplicate) {
        pushIssue(issues, "attributionLabel", "nickname_duplicate", "User-facing agent labels must be unique.");
    }
}
function validateCatalogIds(ids, catalogIds, path, issues) {
    for (const id of missingFromCatalog(ids, catalogIds)) {
        pushIssue(issues, path, "catalog_id_missing", `The referenced catalog item is not available: ${id}`);
    }
}
function validateAvailableCatalogIds(ids, availableCatalogIds, path, issues) {
    if (!availableCatalogIds) {
        return;
    }
    const available = stringSet(availableCatalogIds);
    for (const id of ids) {
        if (!available?.has(id)) {
            pushIssue(issues, path, "catalog_item_unavailable", `The referenced catalog item is not currently available: ${id}`);
        }
    }
}
function validateEditableAgent(agent, path, issues) {
    if (agent?.status === "archived") {
        pushIssue(issues, path, "archived_agent_not_editable", "Archived sub-agent settings cannot be edited.");
    }
}
function validateModelCommand(command, context, issues) {
    if (command.mode === "inherit") {
        return;
    }
    if (!cleanText(command.providerId) || !cleanText(command.modelId)) {
        pushIssue(issues, "modelId", "model_id_missing", "A provider and model are required for override mode.");
        return;
    }
    const providerId = cleanText(command.providerId);
    const primaryModelId = cleanText(command.modelId);
    if (context.catalogs?.enabledProviderIds && !context.catalogs.enabledProviderIds.includes(providerId)) {
        pushIssue(issues, "providerId", "model_provider_unavailable", `The model provider is not enabled: ${providerId}`);
    }
    const modelId = `${providerId}:${primaryModelId}`;
    if (context.catalogs?.modelIds && !context.catalogs.modelIds.includes(modelId)) {
        pushIssue(issues, "modelId", "model_id_missing", `The model is not available in the shared catalog: ${modelId}`);
    }
    const fallbackModelId = cleanText(command.fallbackModelId);
    if (fallbackModelId) {
        if (fallbackModelId === primaryModelId) {
            pushIssue(issues, "fallbackModelId", "fallback_model_same_as_primary", "Fallback model must differ from the primary model.");
        }
        const fallbackCatalogId = `${providerId}:${fallbackModelId}`;
        if (context.catalogs?.modelIds && !context.catalogs.modelIds.includes(fallbackCatalogId)) {
            pushIssue(issues, "fallbackModelId", "model_id_missing", `The fallback model is not available in the shared catalog: ${fallbackCatalogId}`);
        }
    }
}
function validateMemoryCommand(command, issues) {
    if (!ownerMatchesAgent(command.agentId, command.owner) ||
        !ownerMatchesAgent(command.agentId, command.writeScope) ||
        !command.readScopes.every((scope) => ownerMatchesAgent(command.agentId, scope))) {
        pushIssue(issues, "memory", "memory_owner_scope_mismatch", "A sub-agent memory policy cannot bind to another sub-agent owner scope.");
    }
    if (command.compactThreshold <= 0) {
        pushIssue(issues, "compactThreshold", "invalid_numeric_limit", "The compact threshold must be greater than zero.");
    }
    if (command.compactThreshold > 1_000_000) {
        pushIssue(issues, "compactThreshold", "invalid_numeric_limit", "The compact threshold is too large for the setup UI.");
    }
}
function validateCapabilityCommand(command, context, issues) {
    validateCatalogIds(command.allowedCapabilityIds, context.catalogs?.capabilityIds, "allowedCapabilityIds", issues);
    validateCatalogIds(command.deniedCapabilityIds, context.catalogs?.capabilityIds, "deniedCapabilityIds", issues);
    validateCatalogIds(command.approvalRequiredCapabilityIds, context.catalogs?.capabilityIds, "approvalRequiredCapabilityIds", issues);
    validateCatalogIds(command.osSensitiveCapabilityIds, context.catalogs?.capabilityIds, "osSensitiveCapabilityIds", issues);
    const dangerousCatalog = stringSet(context.catalogs?.dangerousCapabilityIds);
    const requestedDangerous = command.allowedCapabilityIds.some((id) => dangerousCatalog?.has(id));
    if (requestedDangerous && command.source !== "advanced") {
        pushIssue(issues, "allowedCapabilityIds", "permission_escalation_requires_advanced", "Dangerous capabilities must be granted from advanced settings.");
    }
}
function validateDelegationCommand(command, context, issues) {
    if (!command.directChildOnly) {
        pushIssue(issues, "directChildOnly", "direct_child_only_required", "Sub-agent delegation must stay within direct child relationships.");
    }
    const allowedChildren = stringSet(directChildIds(command.agentId, context.relationships));
    for (const childId of command.allowedChildAgentIds) {
        if (childId === command.agentId) {
            pushIssue(issues, "allowedChildAgentIds", "delegation_target_self", "A sub-agent cannot delegate to itself.");
            continue;
        }
        if (!allowedChildren?.has(childId)) {
            pushIssue(issues, "allowedChildAgentIds", "delegation_target_not_direct_child", `The delegation target is not a direct child of this sub-agent: ${childId}`);
            continue;
        }
        const child = context.agents.find((agent) => agent.agentId === childId);
        if (!child || child.status !== "enabled") {
            pushIssue(issues, "allowedChildAgentIds", "delegation_target_unavailable", `The delegation target is not currently enabled: ${childId}`);
        }
    }
}
export function validateSubAgentSettingsCommand(command, context) {
    const issues = [];
    switch (command.kind) {
        case "create_basic": {
            if (!context.agents.some((agent) => agent.agentId === command.parentAgentId) && command.parentAgentId !== context.rootAgent.agentId) {
                pushIssue(issues, "parentAgentId", "parent_missing", "The parent agent does not exist.");
            }
            if (!cleanText(command.displayName)) {
                pushIssue(issues, "displayName", "display_name_required", "A display name is required.");
            }
            validateIdentityNameSet([
                { path: "displayName", value: command.displayName },
                { path: "nickname", value: command.nickname },
            ], context.rootAgent, issues);
            validateNicknameUnique(undefined, command.nickname, context, issues);
            break;
        }
        case "update_identity": {
            validateAgentExists(command, context, issues);
            if (!cleanText(command.displayName)) {
                pushIssue(issues, "displayName", "display_name_required", "A display name is required.");
            }
            validateIdentityNameSet([
                { path: "displayName", value: command.displayName },
                { path: "nickname", value: command.nickname },
                { path: "attributionLabel", value: command.attributionLabel },
            ], context.rootAgent, issues);
            validateNicknameUnique(command.agentId, command.nickname, context, issues);
            validateAttributionLabelUnique(command.agentId, command.attributionLabel, context, issues);
            break;
        }
        case "update_model_policy":
            validateAgentExists(command, context, issues);
            validateModelCommand(command, context, issues);
            break;
        case "update_skill_mcp_bindings":
            validateEditableAgent(validateAgentExists(command, context, issues), "agentId", issues);
            validateCatalogIds(command.enabledSkillIds, context.catalogs?.skillIds, "enabledSkillIds", issues);
            validateCatalogIds(command.enabledMcpServerIds, context.catalogs?.mcpServerIds, "enabledMcpServerIds", issues);
            validateAvailableCatalogIds(command.enabledSkillIds, context.catalogs?.availableSkillIds, "enabledSkillIds", issues);
            validateAvailableCatalogIds(command.enabledMcpServerIds, context.catalogs?.availableMcpServerIds, "enabledMcpServerIds", issues);
            break;
        case "update_memory_policy":
            validateAgentExists(command, context, issues);
            validateMemoryCommand(command, issues);
            break;
        case "update_capability_policy":
            validateAgentExists(command, context, issues);
            validateCapabilityCommand(command, context, issues);
            break;
        case "update_delegation_policy":
            if (command.agentId !== context.rootAgent.agentId) {
                validateAgentExists(command, context, issues);
            }
            validateDelegationCommand(command, context, issues);
            break;
        case "publish_topology":
            for (const agentId of command.agentIds) {
                if (!context.agents.some((agent) => agent.agentId === agentId)) {
                    pushIssue(issues, "agentIds", "agent_missing", `The target sub-agent does not exist: ${agentId}`);
                }
            }
            break;
        case "archive_agent": {
            const agent = validateAgentExists(command, context, issues);
            const children = agent ? directChildIds(agent.agentId, context.relationships) : [];
            if (children.length > 0 && !command.replacementAgentId) {
                pushIssue(issues, "replacementAgentId", "archive_requires_replacement_or_no_children", "Archiving a parent sub-agent requires a replacement or prior child reassignment.");
            }
            break;
        }
        default: {
            const exhaustive = command;
            return exhaustive;
        }
    }
    return {
        ok: issues.length === 0,
        command,
        issues,
    };
}
//# sourceMappingURL=sub-agent-settings.js.map