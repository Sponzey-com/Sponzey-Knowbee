import { createHash } from "node:crypto";
import { CONTRACT_SCHEMA_VERSION } from "../contracts/index.js";
import { DEFAULT_KNOWBEE_AGENT_NAME, normalizeAgentNameSnapshot, resolveAgentConfigAgentName, } from "../contracts/sub-agent-orchestration.js";
import { validateSubAgentPromptLayerStack, } from "../contracts/sub-agent-prompt-layer.js";
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { validateAgentPromptBundleContextScope, } from "../runs/context-preflight.js";
import { normalizeSkillMcpAllowlist } from "../security/capability-isolation.js";
import { resolveAgentCapabilityModelSummary, } from "./capability-model.js";
import { composeAgentPromptSources, } from "./prompt-policy-adapter.js";
export const AGENT_PROMPT_BUNDLE_VERSION = "agent-prompt-bundle-v1";
const PROMPT_BUNDLE_DEFAULT_SAFETY_RULES_SOURCE_ID = "prompt_bundle_default_safety_rules_user";
const PROMPT_BUNDLE_SELF_AGENT_NAME_RULE_SOURCE_ID = "prompt_bundle_self_agent_name_rule_user";
const PROMPT_BUNDLE_AGENT_NAME_ATTRIBUTION_RULE_SOURCE_ID = "prompt_bundle_agent_name_attribution_rule_user";
const PROMPT_BUNDLE_EXECUTOR_PROFILE_PROJECTION_SOURCE_ID = "prompt_bundle_executor_profile_projection_user";
const PROMPT_BUNDLE_CONTEXT_LABELS_SOURCE_ID = "prompt_bundle_context_labels_user";
function promptBundleContextLabel(key) {
    const value = loadPromptValue(PROMPT_BUNDLE_CONTEXT_LABELS_SOURCE_ID, {}, { required: true })
        .split(/\r?\n/u)
        .find((line) => line.startsWith(`${key}=`))
        ?.slice(key.length + 1)
        .trim();
    return value ?? key;
}
export function buildPromptContextBlockPlan(input) {
    const includeLatest = input.hasLatestUserMessage !== false;
    const includeChannel = input.hasChannelMetadata !== false;
    const includeGraph = input.hasExecutionGraph !== false;
    const continuation = input.mode === "explicit_continuation";
    const handoff = input.mode === "handoff";
    return {
        mode: input.mode,
        includedContextBlocks: [
            {
                blockId: "latest_user_message",
                included: includeLatest,
                reason: includeLatest ? "current_request_input" : "not_available",
            },
            {
                blockId: "channel_metadata",
                included: includeChannel,
                reason: includeChannel ? "current_channel_boundary" : "not_available",
            },
            {
                blockId: "execution_graph",
                included: includeGraph,
                reason: includeGraph ? "current_execution_graph" : "not_available",
            },
            {
                blockId: "request_group_context",
                included: continuation && input.hasRequestGroupContext === true,
                reason: continuation && input.hasRequestGroupContext === true
                    ? "explicit_continuation_only"
                    : "excluded_without_explicit_continuation",
            },
            {
                blockId: "parent_work_order",
                included: handoff && input.hasParentWorkOrder === true,
                reason: handoff && input.hasParentWorkOrder === true
                    ? "handoff_parent_scope"
                    : "not_handoff_context",
            },
            {
                blockId: "required_outputs",
                included: handoff && input.hasRequiredOutputs === true,
                reason: handoff && input.hasRequiredOutputs === true
                    ? "handoff_output_contract"
                    : "not_handoff_context",
            },
            {
                blockId: "verification_notes",
                included: handoff && input.hasVerificationNotes === true,
                reason: handoff && input.hasVerificationNotes === true
                    ? "handoff_verification_contract"
                    : "not_handoff_context",
            },
            {
                blockId: "return_to_parent_contract",
                included: handoff && input.hasReturnToParentContract === true,
                reason: handoff && input.hasReturnToParentContract === true
                    ? "child_returns_to_parent"
                    : "not_handoff_context",
            },
        ],
    };
}
export function buildExecutorProfilePromptProjection(input) {
    const profileById = new Map(input.executorProfiles.map((profile) => [profile.executorId, profile]));
    const agentNameForExecutor = (executorId) => {
        const value = input.agentNamesByExecutorId?.[executorId]?.trim();
        return value || undefined;
    };
    const selectableIds = uniqueStrings(input.connections
        .filter((connection) => connection.fromExecutorId === input.currentExecutorId)
        .map((connection) => connection.toExecutorId));
    const selectableExecutors = selectableIds.flatMap((executorId) => {
        const profile = profileById.get(executorId);
        if (!profile)
            return [];
        const agentName = agentNameForExecutor(executorId);
        return [executorProfilePromptItem({
                profile,
                ...(agentName ? { agentName } : {}),
                connectedNextExecutorIds: uniqueStrings(input.connections
                    .filter((connection) => connection.fromExecutorId === executorId)
                    .map((connection) => connection.toExecutorId)),
            })];
    });
    return {
        currentExecutorId: input.currentExecutorId,
        graphSource: "provided_connections",
        selectableExecutors,
        diagnosticExecutors: input.executorProfiles
            .filter((profile) => !selectableIds.includes(profile.executorId) && profile.executorId !== input.currentExecutorId)
            .map((profile) => {
            const agentName = agentNameForExecutor(profile.executorId);
            return executorProfilePromptItem({
                profile,
                ...(agentName ? { agentName } : {}),
                connectedNextExecutorIds: uniqueStrings(input.connections
                    .filter((connection) => connection.fromExecutorId === profile.executorId)
                    .map((connection) => connection.toExecutorId)),
            });
        }),
        connections: [...input.connections],
    };
}
export function executorProfilePromptItem(input) {
    const agentName = input.agentName?.trim() || "Unnamed sub-agent";
    return {
        schemaVersion: input.profile.schemaVersion,
        executorId: input.profile.executorId,
        agentName,
        roleName: input.profile.roleName,
        definition: input.profile.definition,
        does: input.profile.does,
        delegationScope: input.profile.delegationScope,
        expectedOutputs: input.profile.expectedOutputs,
        handoffStyle: input.profile.handoffStyle,
        declineCriteria: input.profile.declineCriteria,
        riskBoundary: input.profile.riskBoundary,
        connectedNextExecutorIds: input.connectedNextExecutorIds,
    };
}
const defaultAgentPromptBundleBuildDependencies = {
    resolveCapabilityModelSummary,
};
export function buildAgentPromptBundle(input, dependencies = defaultAgentPromptBundleBuildDependencies) {
    const now = input.now?.() ?? Date.now();
    const locale = input.locale ?? "en";
    const promptSources = input.promptSources ?? loadSafePromptSources(input.workDir);
    const linkedSources = composeAgentPromptSources({
        sources: promptSources,
        agentType: input.agent.agentType,
        hasExplicitUserTraits: Boolean(input.explicitTraits),
    });
    const capabilityModelSummary = dependencies.resolveCapabilityModelSummary(input.agent);
    const promptSourceOptions = {
        ...(input.workDir ? { workDir: input.workDir } : {}),
        locale,
    };
    const safetyRules = loadPromptBundleDefaultSafetyRules(promptSourceOptions);
    const agentName = normalizeAgentNameSnapshot(resolveAgentConfigAgentName(input.agent));
    const promptLayerStack = [
        { kind: "global_system", sourceRef: "prompt:system", owner: "platform" },
        { kind: "common_policy", sourceRef: `policy-bundle:${hashValue(linkedSources.map((source) => source.checksum))}`, owner: "platform" },
        { kind: "agent_system", sourceRef: `agent-system:${input.agent.agentId}`, owner: agentName },
        ...(input.explicitTraits
            ? [{ kind: "explicit_user_traits", sourceRef: input.explicitTraits.sourceRef, owner: agentName }]
            : []),
        { kind: "work_handoff", sourceRef: `work-handoff:${hashValue(input.taskScope)}`, owner: agentName },
    ];
    validateSubAgentPromptLayerStack({
        agentName,
        layers: promptLayerStack,
        ...(input.explicitTraits ? { explicitTraits: input.explicitTraits } : {}),
    });
    const profileFragments = [
        makeFragment("identity", "Agent identity", formatIdentity(input.agent), `profile:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("self_agent_name_rule", "Self agent name response rule", formatSelfAgentNameRule(input.agent, promptSourceOptions), `profile:${input.agent.agentId}:agent-name-rule`, profileVersion(input.agent), "active"),
        makeFragment("agent_name_attribution_rule", "Agent name handoff and delivery attribution rule", formatAgentNameAttributionRule(input.agent, promptSourceOptions), "policy:agent-name-attribution", AGENT_PROMPT_BUNDLE_VERSION, "active"),
        makeFragment("role", "Agent role", input.agent.role, `profile:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        ...(input.explicitTraits
            ? [makeFragment("personality", "Agent personality", input.explicitTraits.text, input.explicitTraits.sourceRef, profileVersion(input.agent), "active")]
            : []),
        makeFragment("specialty", "Agent specialties", formatList(input.agent.specialtyTags), `profile:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("avoid_tasks", "Avoid tasks", formatList(input.agent.avoidTasks), `profile:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("team_context", "Team context", formatTeamContext(input.agent, input.teams ?? []), `team-context:${input.agent.agentId}`, teamContextVersion(input.teams ?? []), "active"),
        makeFragment("memory_policy", "Memory policy", formatMemoryPolicy(input.agent), `memory-policy:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("capability_policy", "Capability policy", formatCapabilityPolicy(input.agent), `capability-policy:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("capability_catalog", "Common work ability and external feature connection catalog references", formatCapabilityCatalogReference(input.agent, capabilityModelSummary), `capability-catalog:${input.agent.agentId}`, capabilityCatalogVersion(input.agent, capabilityModelSummary), "active"),
        makeFragment("capability_binding", "Agent-specific work ability and external feature connection binding summary", formatCapabilityBindingSummary(input.agent, capabilityModelSummary), `capability-binding:${input.agent.agentId}`, capabilityBindingVersion(input.agent, capabilityModelSummary), "active"),
        makeFragment("permission_profile", "Permission profile", formatPermissionProfile(input.agent), `permission-profile:${input.agent.agentId}`, profileVersion(input.agent), "active"),
        makeFragment("model_profile", "Model profile", formatModelProfile(input.agent, capabilityModelSummary), `model-profile:${input.agent.agentId}`, modelProfileVersion(input.agent, capabilityModelSummary), "active"),
    ];
    const handoffFragments = [
        makeFragment("completion_criteria", "Completion criteria", formatCompletionCriteria(input.taskScope), `task-scope:${input.taskScope.actionType}`, scopeVersion(input.taskScope), "active"),
        ...makeExecutorProfileProjectionFragments(input.executorProfileProjection, promptSourceOptions),
    ];
    const globalSourceFragments = linkedSources
        .filter((source) => source.sourceId === "system")
        .map((source) => makePromptSourceFragment(source));
    const agentSourceFragments = linkedSources
        .filter((source) => source.sourceId === "sub_agent_base" || source.sourceId === "agent_persona")
        .map((source) => makePromptSourceFragment(source));
    const commonSourceFragments = linkedSources
        .filter((source) => !["system", "sub_agent_base", "agent_persona", "result_review", "final_response"].includes(source.sourceId))
        .map((source) => makePromptSourceFragment(source));
    const reviewSourceFragments = linkedSources
        .filter((source) => source.sourceId === "result_review")
        .map((source) => makePromptSourceFragment(source));
    const finalResponseSourceFragments = linkedSources
        .filter((source) => source.sourceId === "final_response")
        .map((source) => makePromptSourceFragment(source));
    const fragments = [
        ...globalSourceFragments,
        ...commonSourceFragments,
        ...profileFragments.filter((fragment) => fragment.kind !== "personality"),
        ...agentSourceFragments,
        ...(input.importedFragments ?? []).map((fragment) => makeImportedFragment(fragment)),
        ...profileFragments.filter((fragment) => fragment.kind === "personality"),
        ...handoffFragments,
        ...reviewSourceFragments,
        ...finalResponseSourceFragments,
    ].filter((fragment) => fragment.content.trim());
    const contextScope = validateAgentPromptBundleContextScope({
        bundle: {
            agentId: input.agent.agentId,
            agentType: input.agent.agentType,
            memoryPolicy: input.agent.memoryPolicy,
        },
        ...(input.memoryRefs ? { memoryRefs: input.memoryRefs } : {}),
        ...(input.dataExchangePackages ? { dataExchangePackages: input.dataExchangePackages } : {}),
    });
    const taskPreflightIssueCodes = promptBundleTaskPreflightIssueCodes(input.taskScope);
    const normalizedFragments = fragments.map((fragment) => applyFragmentValidation(fragment));
    const issueCodes = new Set([
        ...normalizedFragments.flatMap((fragment) => fragment.issueCodes ?? []),
        ...contextScope.issueCodes,
        ...taskPreflightIssueCodes,
    ]);
    const blockedSourceRefs = new Set(contextScope.blockedSourceRefs);
    const finalFragments = normalizedFragments.map((fragment) => {
        if (!blockedSourceRefs.has(fragment.sourceId))
            return fragment;
        return {
            ...fragment,
            status: "blocked",
            issueCodes: uniqueStrings([...(fragment.issueCodes ?? []), "context_scope_blocked"]),
        };
    });
    const sourceProvenance = buildSourceProvenance(input.agent, input.teams ?? [], linkedSources, input.importedFragments ?? []);
    const blockedFragments = finalFragments.filter((fragment) => fragment.status === "blocked");
    const inactiveFragments = finalFragments.filter((fragment) => fragment.status === "inactive");
    const cacheKey = buildAgentPromptBundleCacheKey({
        agent: input.agent,
        taskScope: input.taskScope,
        teams: input.teams ?? [],
        sourceProvenance,
        fragments: finalFragments,
        safetyRules,
    });
    const identity = buildRuntimeIdentity({
        agent: input.agent,
        bundleId: `prompt-bundle:${input.agent.agentId}:${cacheKey.slice(0, 16)}`,
        idempotencyKey: input.idProvider?.() ?? `prompt-bundle:${input.agent.agentId}:${cacheKey}`,
        ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
        ...(input.parentRequestId ? { parentRequestId: input.parentRequestId } : {}),
        ...(input.auditCorrelationId ? { auditCorrelationId: input.auditCorrelationId } : {}),
    });
    const validation = {
        ok: blockedFragments.length === 0 && contextScope.ok && taskPreflightIssueCodes.length === 0,
        issueCodes: uniqueStrings([...issueCodes]),
        blockedFragmentIds: blockedFragments.map((fragment) => fragment.fragmentId).sort(),
        inactiveFragmentIds: inactiveFragments.map((fragment) => fragment.fragmentId).sort(),
    };
    const renderedPrompt = renderAgentPromptBundleText({
        agent: input.agent,
        fragments: finalFragments,
        safetyRules,
        validation,
    });
    const promptChecksum = `sha256:${hashText(renderedPrompt)}`;
    const bundle = {
        identity,
        bundleId: identity.entityId,
        agentId: input.agent.agentId,
        agentType: input.agent.agentType,
        role: input.agent.role,
        agentName,
        agentNameSnapshot: agentName,
        ...(input.explicitTraits ? { personalitySnapshot: input.explicitTraits.text } : {}),
        promptLayerStack,
        teamContext: buildBundleTeamContext(input.agent, input.teams ?? []),
        memoryPolicy: input.agent.memoryPolicy,
        capabilityPolicy: sanitizeCapabilityPolicyForBundle(input.agent.capabilityPolicy),
        ...(input.agent.modelProfile
            ? { modelProfileSnapshot: structuredClone(input.agent.modelProfile) }
            : {}),
        taskScope: input.taskScope,
        safetyRules,
        sourceProvenance,
        fragments: finalFragments,
        validation,
        cacheKey,
        promptChecksum,
        profileVersionSnapshot: input.agent.profileVersion,
        renderedPrompt,
        completionCriteria: input.taskScope.expectedOutputs,
        createdAt: now,
    };
    return {
        bundle,
        blockedFragments,
        inactiveFragments,
        issueCodes: validation.issueCodes,
        cacheKey,
        promptChecksum,
        renderedPrompt,
    };
}
export function buildAgentPromptBundleCacheKey(input) {
    return hashValue({
        version: AGENT_PROMPT_BUNDLE_VERSION,
        agentId: input.agent.agentId,
        agentType: input.agent.agentType,
        profileVersion: input.agent.profileVersion,
        updatedAt: input.agent.updatedAt,
        memoryPolicy: input.agent.memoryPolicy,
        capabilityPolicy: sanitizeCapabilityPolicyForBundle(input.agent.capabilityPolicy),
        modelProfile: input.agent.modelProfile ?? null,
        teamVersions: (input.teams ?? []).map((team) => [
            team.teamId,
            team.profileVersion,
            team.updatedAt,
        ]),
        taskScope: input.taskScope,
        sourceProvenance: input.sourceProvenance ?? [],
        safetyRules: input.safetyRules ?? loadPromptBundleDefaultSafetyRules(),
        fragments: (input.fragments ?? []).map((fragment) => [
            fragment.fragmentId,
            fragment.status,
            fragment.checksum,
            fragment.version,
            fragment.issueCodes ?? [],
        ]),
    });
}
export function renderAgentPromptBundleText(input) {
    const activeFragments = input.fragments.filter((fragment) => fragment.status === "active");
    return [
        promptBundleContextLabel("agent_prompt_bundle_header"),
        `agentId: ${input.agent.agentId}`,
        `agentType: ${input.agent.agentType}`,
        `agentName: ${promptBundleAgentName(input.agent)}`,
        "",
        promptBundleContextLabel("safety_boundaries_header"),
        ...(input.safetyRules ?? loadPromptBundleDefaultSafetyRules()).map((rule) => `- ${rule}`),
        "",
        promptBundleContextLabel("active_profile_fragments_header"),
        ...activeFragments.map((fragment) => [`## ${fragment.title}`, `source: ${fragment.sourceId}`, fragment.content].join("\n")),
        input.validation && !input.validation.ok
            ? [
                "",
                promptBundleContextLabel("blocked_prompt_bundle_issues_header"),
                ...input.validation.issueCodes.map((code) => `- ${code}`),
            ].join("\n")
            : "",
    ]
        .filter(Boolean)
        .join("\n");
}
function promptBundleAgentName(agent) {
    const configuredName = normalizeAgentNameSnapshot(agent.agentName ?? "");
    if (configuredName)
        return configuredName;
    if (agent.agentType === "knowbee")
        return DEFAULT_KNOWBEE_AGENT_NAME;
    if (agent.agentType === "sub_agent")
        return "Unnamed sub-agent";
    return "Unnamed agent";
}
export function redactPromptSecrets(value) {
    return value
        .replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, "[redacted-token]")
        .replace(/\b(xox[abprs]-[A-Za-z0-9-]{8,})\b/g, "[redacted-token]")
        .replace(/\b(bot[0-9]{6,}:[A-Za-z0-9_-]{10,})\b/g, "[redacted-token]")
        .replace(/\b(api[_-]?key|token|password|passwd|secret)\b\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=[redacted]");
}
export class PromptBundleCache {
    entries = new Map();
    hits = 0;
    misses = 0;
    get(cacheKey) {
        const entry = this.entries.get(cacheKey);
        if (!entry) {
            this.misses += 1;
            return undefined;
        }
        this.hits += 1;
        return entry.bundle;
    }
    set(result) {
        this.entries.set(result.cacheKey, {
            cacheKey: result.cacheKey,
            bundle: result.bundle,
            createdAt: result.bundle.createdAt,
            ...(result.promptChecksum ? { promptChecksum: result.promptChecksum } : {}),
        });
        return result.bundle;
    }
    getOrBuild(input) {
        const result = buildAgentPromptBundle(input);
        const cached = this.get(result.cacheKey);
        if (cached) {
            return {
                ...result,
                bundle: cached,
                renderedPrompt: cached.renderedPrompt ?? result.renderedPrompt,
                promptChecksum: cached.promptChecksum ?? result.promptChecksum,
            };
        }
        this.set(result);
        return result;
    }
    invalidate(cacheKey) {
        if (cacheKey)
            this.entries.delete(cacheKey);
        else
            this.entries.clear();
    }
    stats() {
        return {
            size: this.entries.size,
            hits: this.hits,
            misses: this.misses,
        };
    }
}
export function createPromptBundleCache() {
    return new PromptBundleCache();
}
function loadSafePromptSources(workDir) {
    try {
        return workDir ? loadPromptSourceRegistry(workDir) : [];
    }
    catch {
        return [];
    }
}
function makeFragment(kind, title, content, sourceId, version, status) {
    const redacted = redactPromptSecrets(content.trim());
    return {
        fragmentId: `${kind}:${hashValue({ title, sourceId, redacted }).slice(0, 12)}`,
        kind,
        title,
        content: redacted,
        status,
        sourceId,
        version,
        checksum: `sha256:${hashText(redacted)}`,
    };
}
function makePromptSourceFragment(source) {
    const status = source.usageScope === "runtime" && source.enabled ? "active" : "inactive";
    const issueCodes = status === "inactive" ? ["prompt_source_reference_only"] : undefined;
    return {
        ...makeFragment("prompt_source", `Prompt source: ${source.sourceId}`, [
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content,
        ].join("\n"), `prompt:${source.sourceId}:${source.locale}`, source.version, status),
        ...(issueCodes ? { issueCodes } : {}),
    };
}
function makeExecutorProfileProjectionFragments(projection, options = {}) {
    if (!projection || projection.selectableExecutors.length === 0)
        return [];
    return [
        makeFragment("executor_profile_projection", "Available direct executors for current agent", formatExecutorProfileProjection(projection, options), `executor-profile-projection:${projection.currentExecutorId}`, `executorProfileProjection:${hashValue(projection)}`, "active"),
    ];
}
function formatExecutorProfileProjection(projection, options = {}) {
    const selectableExecutors = projection.selectableExecutors.flatMap((executor, index) => [
        `executor ${index + 1}`,
        `id: ${executor.executorId}`,
        `agentName: ${executor.agentName}`,
        `roleName: ${executor.roleName}`,
        `definition: ${executor.definition}`,
        `does: ${formatList(executor.does)}`,
        `delegationScope: ${formatList(executor.delegationScope)}`,
        `expectedOutputs: ${formatList(executor.expectedOutputs)}`,
        `handoffStyle: ${executor.handoffStyle}`,
        `declineCriteria: ${formatList(executor.declineCriteria)}`,
        `riskBoundary: ${formatList(executor.riskBoundary)}`,
        `connectedNextExecutors: ${formatList(executor.connectedNextExecutorIds)}`,
        "",
    ]).join("\n").trim();
    const diagnosticExecutors = (projection.diagnosticExecutors?.length
        ? (projection.diagnosticExecutors ?? []).flatMap((executor, index) => [
            `diagnostic executor ${index + 1}`,
            `id: ${executor.executorId}`,
            `agentName: ${executor.agentName}`,
            `roleName: ${executor.roleName}`,
            `definition: ${executor.definition}`,
            `connectedNextExecutors: ${formatList(executor.connectedNextExecutorIds)}`,
            "",
        ]).join("\n").trim()
        : "");
    const allowedGraphEdges = (projection.connections?.length
        ? (projection.connections ?? []).map((connection) => `${connection.fromExecutorId} -> ${connection.toExecutorId}${connection.relation ? ` (${connection.relation})` : ""}`).join("\n").trim()
        : "");
    return loadPromptValue(PROMPT_BUNDLE_EXECUTOR_PROFILE_PROJECTION_SOURCE_ID, {
        currentExecutorId: projection.currentExecutorId,
        graphSourceLine: projection.graphSource ? `graphSource: ${projection.graphSource}` : "",
        selectableExecutors,
        diagnosticExecutors,
        allowedGraphEdges,
    }, { required: true, ...options });
}
function resolveCapabilityModelSummary(agent) {
    return agent.agentType === "sub_agent"
        ? resolveAgentCapabilityModelSummary(agent)
        : undefined;
}
function sanitizeCapabilityPolicyForBundle(policy) {
    const allowlist = normalizeSkillMcpAllowlist(policy.skillMcpAllowlist);
    return {
        ...policy,
        skillMcpAllowlist: {
            enabledSkillIds: [...allowlist.enabledSkillIds],
            enabledMcpServerIds: [...allowlist.enabledMcpServerIds],
            enabledToolNames: [...allowlist.enabledToolNames],
            disabledToolNames: [...allowlist.disabledToolNames],
        },
    };
}
function promptBundleTaskPreflightIssueCodes(scope) {
    return scope.expectedOutputs.length === 0 ? ["expected_output_required"] : [];
}
function makeImportedFragment(input) {
    const requestedStatus = input.status ?? (input.autoActivate ? "active" : "review");
    const status = input.kind === "imported_profile" && requestedStatus === "active" && !input.reviewApproved
        ? "review"
        : requestedStatus;
    const issueCodes = input.kind === "imported_profile" && requestedStatus === "active" && !input.reviewApproved
        ? ["imported_profile_requires_review"]
        : undefined;
    const fragment = makeFragment(input.kind, input.title, input.content, input.sourceId, input.version ?? "imported", status);
    return issueCodes ? { ...fragment, issueCodes } : fragment;
}
function applyFragmentValidation(fragment) {
    const issueCodes = uniqueStrings([
        ...(fragment.issueCodes ?? []),
        ...detectUnsafePromptFragmentForKind(fragment),
    ]);
    if (issueCodes.length === 0)
        return fragment;
    const unsafe = issueCodes.some((code) => code.startsWith("unsafe_") || code.includes("permission") || code.includes("secret"));
    return {
        ...fragment,
        status: unsafe ? "blocked" : fragment.status,
        issueCodes,
    };
}
function detectUnsafePromptFragmentForKind(fragment) {
    if (!shouldScanFragmentForUnsafeInstruction(fragment))
        return [];
    return detectUnsafePromptFragment(fragment.content);
}
function shouldScanFragmentForUnsafeInstruction(fragment) {
    // Runtime prompt sources and generated policy fragments are trusted policy inputs.
    // Imported profile text is external profile material and must be isolated by the
    // prompt-bundle safety preflight before it can affect an executor.
    return fragment.kind === "imported_profile";
}
function detectUnsafePromptFragment(content) {
    const normalized = content.toLowerCase();
    const issues = [];
    if (/ignore (all )?(previous|prior) instructions/.test(normalized) ||
        normalized.includes("이전 지시를 무시")) {
        issues.push("unsafe_ignore_prior_instructions");
    }
    if (normalized.includes("disable approval") ||
        normalized.includes("turn off approval") ||
        normalized.includes("승인 없이") ||
        normalized.includes("승인 끄")) {
        issues.push("unsafe_approval_bypass");
    }
    if (normalized.includes("expand tool") ||
        normalized.includes("tool permission") ||
        normalized.includes("mcp allowlist") ||
        normalized.includes("도구 권한")) {
        issues.push("unsafe_permission_expansion");
    }
    if (normalized.includes("reveal secret") ||
        normalized.includes("secret access") ||
        normalized.includes("api key") ||
        normalized.includes("apikey") ||
        normalized.includes("비밀") ||
        normalized.includes("시크릿")) {
        issues.push("unsafe_secret_access");
    }
    if (normalized.includes("remove source agent name") ||
        normalized.includes("strip source agent name") ||
        normalized.includes("remove source agent nickname") ||
        normalized.includes("strip source agent nickname") ||
        normalized.includes("drop source attribution") ||
        normalized.includes("anonymize source agent") ||
        normalized.includes("출처 에이전트 이름 제거") ||
        normalized.includes("출처 닉네임 제거") ||
        normalized.includes("출처를 익명") ||
        normalized.includes("에이전트 이름 표시하지") ||
        normalized.includes("닉네임 표시하지")) {
        issues.push("unsafe_agent_name_attribution_removal");
    }
    if (normalized.includes("pretend to be another agent") ||
        normalized.includes("respond as another agent") ||
        normalized.includes("다른 에이전트인 척") ||
        normalized.includes("다른 에이전트 이름으로 답") ||
        normalized.includes("다른 닉네임으로 답")) {
        issues.push("unsafe_agent_name_impersonation");
    }
    if (normalized.includes("private memory") &&
        (normalized.includes("another agent") || normalized.includes("other agent")) &&
        !normalized.includes("do not") &&
        !normalized.includes("requires explicit") &&
        !normalized.includes("unless an explicit")) {
        issues.push("unsafe_private_memory_access");
    }
    return issues;
}
function buildRuntimeIdentity(input) {
    return {
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        entityType: "capability",
        entityId: input.bundleId,
        owner: input.agent.memoryPolicy.owner,
        idempotencyKey: input.idempotencyKey,
        ...(input.auditCorrelationId ? { auditCorrelationId: input.auditCorrelationId } : {}),
        ...(input.parentRunId || input.parentRequestId
            ? {
                parent: {
                    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
                    ...(input.parentRequestId ? { parentRequestId: input.parentRequestId } : {}),
                },
            }
            : {}),
    };
}
function buildSourceProvenance(agent, teams, promptSources, importedFragments) {
    const items = [
        {
            sourceId: `profile:${agent.agentType}:${agent.agentId}`,
            version: profileVersion(agent),
            checksum: `sha256:${hashValue(agent)}`,
        },
        ...teams.map((team) => ({
            sourceId: `team:${team.teamId}`,
            version: `profileVersion:${team.profileVersion}:updatedAt:${team.updatedAt}`,
            checksum: `sha256:${hashValue(team)}`,
        })),
        ...promptSources.map((source) => ({
            sourceId: `prompt:${source.sourceId}:${source.locale}`,
            version: source.version,
            checksum: source.checksum,
        })),
        ...importedFragments.map((fragment) => ({
            sourceId: fragment.sourceId,
            version: fragment.version ?? "imported",
            checksum: `sha256:${hashText(redactPromptSecrets(fragment.content))}`,
        })),
    ];
    const seen = new Set();
    return items.filter((item) => {
        const key = `${item.sourceId}:${item.version}:${item.checksum ?? ""}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function formatIdentity(agent) {
    return [
        `agentName: ${resolveAgentConfigAgentName(agent)}`,
        `type: ${agent.agentType}`,
        `id: ${agent.agentId}`,
    ]
        .filter(Boolean)
        .join("\n");
}
function formatSelfAgentNameRule(agent, options = {}) {
    const agentName = normalizeAgentNameSnapshot(resolveAgentConfigAgentName(agent));
    return loadPromptValue(PROMPT_BUNDLE_SELF_AGENT_NAME_RULE_SOURCE_ID, {
        agentId: agent.agentId,
        agentName: agentName || "none",
        defaultSelfName: DEFAULT_KNOWBEE_AGENT_NAME,
    }, { required: true, ...options });
}
function formatAgentNameAttributionRule(agent, options = {}) {
    return loadPromptValue(PROMPT_BUNDLE_AGENT_NAME_ATTRIBUTION_RULE_SOURCE_ID, {
        agentId: agent.agentId,
    }, { required: true, ...options });
}
function loadPromptBundleDefaultSafetyRules(options = {}) {
    return loadPromptValue(PROMPT_BUNDLE_DEFAULT_SAFETY_RULES_SOURCE_ID, {}, { required: true, ...options })
        .split(/\n/u)
        .map((line) => line.replace(/^\s*[-*]\s+/u, "").trim())
        .filter(Boolean);
}
function formatTeamContext(agent, teams) {
    const memberTeams = buildBundleTeamContext(agent, teams);
    if (memberTeams.length === 0)
        return "No active team context.";
    return memberTeams
        .map((team) => [
        `teamId: ${team.teamId}`,
        `displayName: ${team.displayName}`,
        team.roleHint ? `roleHint: ${team.roleHint}` : "",
        "policy: reference_only",
    ]
        .filter(Boolean)
        .join("\n"))
        .join("\n\n");
}
function buildBundleTeamContext(agent, teams) {
    return teams
        .filter((team) => team.memberAgentIds.includes(agent.agentId) ||
        team.memberships?.some((membership) => membership.agentId === agent.agentId) ||
        team.ownerAgentId === agent.agentId ||
        team.leadAgentId === agent.agentId)
        .map((team) => {
        const membershipRole = team.memberships?.find((membership) => membership.agentId === agent.agentId)?.primaryRole;
        const roleHint = team.ownerAgentId === agent.agentId
            ? "owner"
            : team.leadAgentId === agent.agentId
                ? "lead"
                : membershipRole ?? team.roleHints[0];
        return {
            teamId: team.teamId,
            displayName: team.displayName,
            ...(roleHint ? { roleHint } : {}),
        };
    })
        .sort((a, b) => a.teamId.localeCompare(b.teamId));
}
function formatMemoryPolicy(agent) {
    const policy = agent.memoryPolicy;
    return [
        `owner: ${policy.owner.ownerType}:${policy.owner.ownerId}`,
        `visibility: ${policy.visibility}`,
        `retention: ${policy.retentionPolicy}`,
        `writebackReviewRequired: ${policy.writebackReviewRequired}`,
        `readScopes: ${policy.readScopes.map((scope) => `${scope.ownerType}:${scope.ownerId}`).join(", ") || "none"}`,
        "boundary: private memory from other agents requires explicit data exchange.",
    ].join("\n");
}
function formatCapabilityPolicy(agent) {
    const allowlist = normalizeSkillMcpAllowlist(agent.capabilityPolicy.skillMcpAllowlist);
    return [
        `enabledWorkAbilityIds: ${formatList(allowlist.enabledSkillIds)}`,
        `enabledExternalFeatureConnectionIds: ${formatList(allowlist.enabledMcpServerIds)}`,
        `enabledTools: ${formatList(allowlist.enabledToolNames)}`,
        `disabledTools: ${formatList(allowlist.disabledToolNames)}`,
        `secretScopeConfigured: ${allowlist.secretScopeId ? "yes" : "no"}`,
        `maxConcurrentCalls: ${agent.capabilityPolicy.rateLimit.maxConcurrentCalls}`,
    ].join("\n");
}
function formatCapabilityCatalogReference(agent, summary) {
    if (!summary) {
        const allowlist = normalizeSkillMcpAllowlist(agent.capabilityPolicy.skillMcpAllowlist);
        return [
            `enabledWorkAbilityIds: ${formatList(allowlist.enabledSkillIds)}`,
            `enabledExternalFeatureConnectionIds: ${formatList(allowlist.enabledMcpServerIds)}`,
            "catalogSource: direct_policy_snapshot",
            "secretScopeValues: redacted",
        ].join("\n");
    }
    return [
        `availableWorkAbilityIds: ${formatList(summary.capabilitySummary.enabledSkillIds)}`,
        `disabledWorkAbilityIds: ${formatList(summary.capabilitySummary.disabledSkillIds)}`,
        `availableExternalFeatureConnectionIds: ${formatList(summary.capabilitySummary.enabledMcpServerIds)}`,
        `disabledExternalFeatureConnectionIds: ${formatList(summary.capabilitySummary.disabledMcpServerIds)}`,
        `enabledTools: ${formatList(summary.capabilitySummary.enabledToolNames)}`,
        `disabledTools: ${formatList(summary.capabilitySummary.disabledToolNames)}`,
        "secretScopeValues: redacted",
    ].join("\n");
}
function formatCapabilityBindingSummary(agent, summary) {
    if (!summary) {
        const allowlist = normalizeSkillMcpAllowlist(agent.capabilityPolicy.skillMcpAllowlist);
        return [
            `agentId: ${agent.agentId}`,
            `enabledWorkAbilityIds: ${formatList(allowlist.enabledSkillIds)}`,
            `enabledExternalFeatureConnectionIds: ${formatList(allowlist.enabledMcpServerIds)}`,
            `enabledTools: ${formatList(allowlist.enabledToolNames)}`,
            `disabledTools: ${formatList(allowlist.disabledToolNames)}`,
            "bindingSource: direct_policy_snapshot",
        ].join("\n");
    }
    const bindings = [
        ...summary.capabilitySummary.skillBindings,
        ...summary.capabilitySummary.mcpServerBindings,
    ];
    if (bindings.length === 0)
        return `agentId: ${agent.agentId}\nbindings: none`;
    return bindings
        .map((binding) => [
        `bindingId: ${binding.bindingId}`,
        `kind: ${binding.catalogKind}`,
        `catalogId: ${binding.catalogId}`,
        `status: ${binding.bindingStatus}`,
        `availability: ${binding.availability}`,
        `risk: ${binding.risk}`,
        `riskCeiling: ${binding.riskCeiling}`,
        `approvalRequiredFrom: ${binding.approvalRequiredFrom}`,
        `enabledTools: ${formatList(binding.enabledToolNames)}`,
        `disabledTools: ${formatList(binding.disabledToolNames)}`,
        `secretScopeConfigured: ${binding.secretScope.configured ? "yes" : "no"}`,
        `reasonCodes: ${formatList(binding.reasonCodes)}`,
    ].join("\n"))
        .join("\n\n");
}
function formatPermissionProfile(agent) {
    const profile = agent.capabilityPolicy.permissionProfile;
    return [
        `profileId: ${profile.profileId}`,
        `riskCeiling: ${profile.riskCeiling}`,
        `approvalRequiredFrom: ${profile.approvalRequiredFrom}`,
        `allowExternalNetwork: ${profile.allowExternalNetwork}`,
        `allowFilesystemWrite: ${profile.allowFilesystemWrite}`,
        `allowShellExecution: ${profile.allowShellExecution}`,
        `allowScreenControl: ${profile.allowScreenControl}`,
        `allowedPaths: ${formatList(profile.allowedPaths)}`,
    ].join("\n");
}
function formatModelProfile(agent, summary) {
    const model = summary?.modelSummary;
    if (model) {
        return [
            `configured: ${model.configured}`,
            `availability: ${model.availability}`,
            model.providerId ? `providerId: ${model.providerId}` : "providerId: none",
            model.modelId ? `modelId: ${model.modelId}` : "modelId: none",
            model.costBudget !== undefined ? `costBudget: ${model.costBudget}` : "costBudget: none",
            `reasonCodes: ${formatList(model.diagnosticReasonCodes)}`,
        ].join("\n");
    }
    const profile = agent.modelProfile;
    return [
        `configured: ${Boolean(profile)}`,
        profile?.providerId ? `providerId: ${profile.providerId}` : "providerId: none",
        profile?.modelId ? `modelId: ${profile.modelId}` : "modelId: none",
        profile?.costBudget !== undefined ? `costBudget: ${profile.costBudget}` : "costBudget: none",
    ].join("\n");
}
function formatCompletionCriteria(scope) {
    return scope.expectedOutputs
        .map((output) => [
        `outputId: ${output.outputId}`,
        `kind: ${output.kind}`,
        `required: ${output.required}`,
        `description: ${output.description}`,
        `evidenceKinds: ${formatList(output.acceptance.requiredEvidenceKinds)}`,
        `artifactRequired: ${output.acceptance.artifactRequired}`,
        `reasonCodes: ${formatList(output.acceptance.reasonCodes)}`,
    ].join("\n"))
        .join("\n\n");
}
function formatList(values) {
    return uniqueStrings(values).join(", ") || "none";
}
function profileVersion(agent) {
    return `profileVersion:${agent.profileVersion}:updatedAt:${agent.updatedAt}`;
}
function capabilityCatalogVersion(agent, summary) {
    return `capabilityCatalog:${hashValue({
        agentId: agent.agentId,
        workAbilityIds: summary?.capabilitySummary.enabledSkillIds ??
            normalizeSkillMcpAllowlist(agent.capabilityPolicy.skillMcpAllowlist).enabledSkillIds,
        externalFeatureConnectionIds: summary?.capabilitySummary.enabledMcpServerIds ??
            normalizeSkillMcpAllowlist(agent.capabilityPolicy.skillMcpAllowlist).enabledMcpServerIds,
        disabledWorkAbilityIds: summary?.capabilitySummary.disabledSkillIds ?? [],
        disabledExternalFeatureConnectionIds: summary?.capabilitySummary.disabledMcpServerIds ?? [],
    }).slice(0, 16)}`;
}
function capabilityBindingVersion(agent, summary) {
    return `capabilityBinding:${hashValue({
        agentId: agent.agentId,
        bindings: summary
            ? [
                ...summary.capabilitySummary.skillBindings,
                ...summary.capabilitySummary.mcpServerBindings,
            ].map((binding) => [
                binding.bindingId,
                binding.bindingStatus,
                binding.catalogStatus,
                binding.availability,
                binding.enabledToolNames,
                binding.disabledToolNames,
                binding.reasonCodes,
            ])
            : sanitizeCapabilityPolicyForBundle(agent.capabilityPolicy),
    }).slice(0, 16)}`;
}
function modelProfileVersion(agent, summary) {
    return `modelProfile:${hashValue({
        model: summary?.modelSummary ?? agent.modelProfile ?? null,
    }).slice(0, 16)}`;
}
function teamContextVersion(teams) {
    return `teams:${hashValue(teams.map((team) => [team.teamId, team.profileVersion, team.updatedAt]))}`;
}
function scopeVersion(scope) {
    return `scope:${hashValue(scope).slice(0, 16)}`;
}
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
function hashText(value) {
    return createHash("sha256").update(value).digest("hex");
}
function hashValue(value) {
    return hashText(stableStringify(value));
}
function stableStringify(value) {
    return JSON.stringify(stabilize(value));
}
function stabilize(value) {
    if (typeof value === "string")
        return redactPromptSecrets(value);
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(stabilize);
    const record = value;
    return Object.keys(record)
        .sort()
        .reduce((acc, key) => {
        acc[key] = stabilize(record[key]);
        return acc;
    }, {});
}
//# sourceMappingURL=prompt-bundle.js.map