import { runAgent } from "../agent/index.js";
const defaultExecutionRuntimeDependencies = {
    runAgent,
};
export function createExecutionChunkStream(params, dependencies = defaultExecutionRuntimeDependencies) {
    return dependencies.runAgent({
        artifactStorage: params.artifactStorage,
        memoryJournal: params.memoryJournal,
        config: params.config,
        userMessage: params.userMessage,
        requiredToolNames: params.requiredToolNames,
        ...(params.completionConditions
            ? { completionConditions: params.completionConditions }
            : {}),
        ...(params.admittedCapabilityExecutionScope
            ? { admittedCapabilityExecutionScope: params.admittedCapabilityExecutionScope }
            : {}),
        webExecutionState: params.webExecutionState,
        memorySearchQuery: params.memorySearchQuery,
        ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
        ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
        sessionId: params.sessionId,
        runId: params.runId,
        ...(params.model ? { model: params.model } : {}),
        ...(params.providerId ? { providerId: params.providerId } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        workDir: params.workDir,
        source: params.source,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        ...(params.agentType ? { agentType: params.agentType } : {}),
        signal: params.signal,
        ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
        ...(params.isRootRequest ? {} : { requestGroupId: params.requestGroupId }),
        contextMode: params.contextMode,
    });
}
//# sourceMappingURL=execution-runtime.js.map