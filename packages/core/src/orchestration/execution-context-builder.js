import { DEFAULT_KNOWBEE_AGENT_NAME } from "../contracts/sub-agent-orchestration.js";
import { AGENT_EXECUTION_DECISION_CONTRACT_VERSION, } from "./execution-decision-contract.js";
import { EXECUTION_GRAPH_ROOT_AGENT_ID, } from "./execution-graph-snapshot.js";
import { buildDefaultAgentExecutionPermissionPolicy, buildDefaultAgentExecutionRiskPolicy, } from "./product-parameter-policy.js";
import { executorProfilePromptItem, } from "./prompt-bundle.js";
function uniqueStrings(values) {
    return [...new Set(values.filter((value) => Boolean(value?.trim())))].sort((left, right) => left.localeCompare(right));
}
function fallbackExecutorProfile(input) {
    const roleName = input.roleName?.trim() || "executor";
    const definition = input.definition?.trim() || `${input.displayName} executor`;
    return {
        schemaVersion: 1,
        executorId: input.executorId,
        displayName: input.displayName,
        roleName,
        definition,
        does: input.specialtyTags?.length ? uniqueStrings(input.specialtyTags) : [definition],
        delegationScope: input.specialtyTags?.length ? uniqueStrings(input.specialtyTags) : [roleName],
        expectedOutputs: ["처리 결과"],
        handoffStyle: "structured_handoff",
        declineCriteria: [],
        riskBoundary: [],
    };
}
function requireUserFacingAgentName(projection, executorId) {
    if (!projection) {
        throw new Error(`agent_name_projection_missing:${executorId}`);
    }
    const agentName = projection.agentName.trim();
    if (!agentName) {
        throw new Error(`agent_name_required:${executorId}`);
    }
    return { projection, agentName };
}
function runtimeProjectionToExecutorProfile(projection, executorId) {
    if (!projection && executorId === EXECUTION_GRAPH_ROOT_AGENT_ID) {
        return {
            executor_id: executorId,
            agent_name: DEFAULT_KNOWBEE_AGENT_NAME,
            role_name: "coordinator",
            definition: "Knowbee main agent coordinator",
            can_delegate: true,
            available: true,
        };
    }
    const validated = requireUserFacingAgentName(projection, executorId);
    const runtimeProjection = validated.projection;
    const agentName = validated.agentName;
    const profile = runtimeProjection.executorProfile ??
        fallbackExecutorProfile({
            executorId: runtimeProjection.agentId,
            displayName: agentName,
            roleName: runtimeProjection.role,
            definition: runtimeProjection.role,
            specialtyTags: runtimeProjection.specialtyTags,
        });
    return {
        executor_id: runtimeProjection.agentId,
        agent_name: agentName,
        role_name: profile.roleName || runtimeProjection.role,
        definition: profile.definition,
        can_delegate: runtimeProjection.delegationEnabled,
        available: runtimeProjection.executionCandidate,
    };
}
function parentExecutorIdFor(graph, executorId) {
    const parents = graph.edges
        .filter((edge) => edge.childAgentId === executorId && edge.executionCandidate)
        .map((edge) => edge.parentAgentId)
        .sort((left, right) => left.localeCompare(right));
    return parents[0];
}
function graphConnection(edge) {
    return {
        from_executor_id: edge.parentAgentId,
        to_executor_id: edge.childAgentId,
        relation: "delegates_to",
        label: edge.source,
    };
}
function diagnosticVisibility(input) {
    if (input.executorId === input.graph.currentExecutorId)
        return "current";
    if (input.executorId === input.parentId)
        return "parent";
    if (input.directChildIds.has(input.executorId)) {
        const projection = input.graph.agentsById[input.executorId];
        return projection?.executionCandidate ? "direct_child" : "unavailable_direct_child";
    }
    return "indirect";
}
export function buildAgentExecutionContextFromGraphSnapshot(input) {
    const graph = input.graph;
    const currentExecutorId = graph.currentExecutorId;
    const currentExecutor = input.currentExecutor ??
        runtimeProjectionToExecutorProfile(graph.agentsById[currentExecutorId], currentExecutorId);
    const availableChildIds = new Set(graph.availableExecutorIds);
    const parentId = parentExecutorIdFor(graph, currentExecutorId);
    const parentExecutor = parentId
        ? runtimeProjectionToExecutorProfile(graph.agentsById[parentId], parentId)
        : undefined;
    const accessibleExecutors = graph.availableExecutorIds.map((executorId) => runtimeProjectionToExecutorProfile(graph.agentsById[executorId], executorId));
    const directChildIds = new Set(graph.directChildAgentIdsByParent[currentExecutorId] ?? []);
    const registeredExecutorIds = graph.allRegisteredExecutorIds ?? graph.allActiveExecutorIds;
    const diagnosticExecutors = registeredExecutorIds
        .filter((executorId) => executorId !== currentExecutorId && !availableChildIds.has(executorId))
        .map((executorId) => {
        const projection = graph.agentsById[executorId];
        return {
            ...runtimeProjectionToExecutorProfile(projection, executorId),
            visibility: diagnosticVisibility({ graph, executorId, directChildIds, parentId }),
            ...(projection?.source ? { graph_source: projection.source } : {}),
            parent_executor_ids: graph.edges
                .filter((edge) => edge.childAgentId === executorId)
                .map((edge) => edge.parentAgentId)
                .sort((left, right) => left.localeCompare(right)),
            ...(projection?.reasonCodes ? { reason_codes: projection.reasonCodes } : {}),
        };
    });
    const accessibleConnections = graph.edges
        .filter((edge) => edge.executionCandidate)
        .map(graphConnection);
    const availableTools = input.availableTools ?? [];
    const defaultPermissionPolicy = buildDefaultAgentExecutionPermissionPolicy();
    const approvalRequiredToolIds = availableTools
        .filter((tool) => tool.permission_scope === "approval_required")
        .map((tool) => tool.tool_id)
        .sort((left, right) => left.localeCompare(right));
    const permissionPolicy = input.permissionPolicy ?? {
        ...defaultPermissionPolicy,
        allowed_tool_ids: availableTools
            .map((tool) => tool.tool_id)
            .sort((left, right) => left.localeCompare(right)),
        ...(approvalRequiredToolIds.length > 0
            ? { approval_required_tool_ids: approvalRequiredToolIds }
            : {}),
    };
    return {
        contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
        request: input.request,
        current_executor: currentExecutor,
        ...(parentExecutor ? { parent_executor: parentExecutor } : {}),
        ...(input.requester ? { requester: input.requester } : {}),
        accessible_executors: accessibleExecutors,
        diagnostic_executors: diagnosticExecutors,
        accessible_connections: accessibleConnections,
        available_tools: availableTools,
        permission_policy: permissionPolicy,
        risk_policy: input.riskPolicy ?? buildDefaultAgentExecutionRiskPolicy(),
        execution_graph: {
            graph_id: graph.graphId,
            graph_source: graph.graphSource,
            root_executor_id: graph.rootAgentId,
            current_executor_id: currentExecutorId,
            available_executor_ids: [...graph.availableExecutorIds],
            diagnostic_executor_ids: diagnosticExecutors.map((executor) => executor.executor_id),
            all_active_executor_ids: [...graph.allActiveExecutorIds],
            all_registered_executor_ids: [...registeredExecutorIds],
            allowed_connections: accessibleConnections,
            validation_issue_codes: graph.validationIssues.map((issue) => issue.code),
            ...(graph.topologyId ? { topology_id: graph.topologyId } : {}),
            ...(graph.topologyVersion !== undefined ? { topology_version: graph.topologyVersion } : {}),
        },
        ...(input.directExecutionRequested !== undefined
            ? { direct_execution_requested: input.directExecutionRequested }
            : {}),
        ...(input.explicitTargetExecutorId
            ? { explicit_target_executor_id: input.explicitTargetExecutorId }
            : {}),
        ...(input.explicitProviderTargetId
            ? { explicit_provider_target_id: input.explicitProviderTargetId }
            : {}),
    };
}
function promptItemForGraphExecutor(graph, executorId) {
    const projection = graph.agentsById[executorId];
    if (!projection)
        return undefined;
    const agentName = requireUserFacingAgentName(projection, executorId).agentName;
    const profile = projection.executorProfile ??
        fallbackExecutorProfile({
            executorId,
            displayName: agentName,
            roleName: projection.role,
            definition: projection.role,
            specialtyTags: projection.specialtyTags,
        });
    return executorProfilePromptItem({
        profile: {
            ...profile,
            executorId,
        },
        agentName,
        connectedNextExecutorIds: uniqueStrings(graph.edges
            .filter((edge) => edge.parentAgentId === executorId && edge.executionCandidate)
            .map((edge) => edge.childAgentId)),
    });
}
export function buildExecutorProfilePromptProjectionFromGraphSnapshot(graph) {
    const selectableExecutors = graph.availableExecutorIds.flatMap((executorId) => {
        const item = promptItemForGraphExecutor(graph, executorId);
        return item ? [item] : [];
    });
    const selectableIds = new Set(selectableExecutors.map((executor) => executor.executorId));
    const registeredExecutorIds = graph.allRegisteredExecutorIds ?? graph.allActiveExecutorIds;
    const diagnosticExecutors = registeredExecutorIds
        .filter((executorId) => executorId !== graph.currentExecutorId && !selectableIds.has(executorId))
        .flatMap((executorId) => {
        const item = promptItemForGraphExecutor(graph, executorId);
        return item ? [item] : [];
    });
    const connections = graph.edges
        .filter((edge) => edge.executionCandidate)
        .map((edge) => ({
        fromExecutorId: edge.parentAgentId,
        toExecutorId: edge.childAgentId,
        relation: edge.source,
    }));
    return {
        currentExecutorId: graph.currentExecutorId,
        graphSource: graph.graphSource,
        selectableExecutors,
        diagnosticExecutors,
        connections,
    };
}
//# sourceMappingURL=execution-context-builder.js.map