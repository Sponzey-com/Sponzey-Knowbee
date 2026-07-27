import { prepareRootLoopBootstrapState } from "./root-loop-bootstrap-state.js";
import { runRootLoopTurn } from "./root-loop-turn.js";
const defaultModuleDependencies = {
    prepareRootLoopBootstrapState,
    runRootLoopTurn,
};
export async function runRootLoop(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const bootstrapState = moduleDependencies.prepareRootLoopBootstrapState(params, dependencies);
    let intakeProcessed = bootstrapState.intakeProcessed;
    let pendingLoopDirective = bootstrapState.pendingLoopDirective;
    let state = bootstrapState.state;
    while (!params.controller.signal.aborted) {
        const loopTurn = await moduleDependencies.runRootLoopTurn({
            artifactStorage: params.artifactStorage,
            memoryJournal: params.memoryJournal,
            runId: params.runId,
            sessionId: params.sessionId,
            requestGroupId: params.requestGroupId,
            source: params.source,
            onChunk: params.onChunk,
            signal: params.controller.signal,
            abortExecutionStream: () => params.controller.abort(),
            pendingLoopDirective,
            intakeProcessed,
            state,
            recoveryBudgetUsage: params.recoveryBudgetUsage,
            executionSemantics: params.executionSemantics,
            originalRequest: params.originalRequest,
            config: params.config,
            ...(params.structuredRequest ? { structuredRequest: params.structuredRequest } : {}),
            requestMessage: params.requestMessage,
            workDir: params.workDir,
            ...(params.finalResponseIdentityContext
                ? { finalResponseIdentityContext: params.finalResponseIdentityContext }
                : {}),
            ...(params.toolsEnabled === false ? { toolsEnabled: false } : {}),
            isRootRequest: params.isRootRequest,
            contextMode: params.contextMode,
            taskProfile: params.taskProfile,
            ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
            ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
            ...(params.memorySearchQuery ? { memorySearchQuery: params.memorySearchQuery } : {}),
            ...(params.workerSessionId ? { workerSessionId: params.workerSessionId } : {}),
            wantsDirectArtifactDelivery: params.wantsDirectArtifactDelivery,
            requiresFilesystemMutation: params.requiresFilesystemMutation,
            requiresPrivilegedToolExecution: params.requiresPrivilegedToolExecution,
            pendingToolParams: params.pendingToolParams,
            filesystemMutationPaths: params.filesystemMutationPaths,
            seenFollowupPrompts: params.seenFollowupPrompts,
            seenCommandFailureRecoveryKeys: params.seenCommandFailureRecoveryKeys,
            seenExecutionRecoveryKeys: params.seenExecutionRecoveryKeys,
            seenDeliveryRecoveryKeys: params.seenDeliveryRecoveryKeys,
            seenAiRecoveryKeys: params.seenAiRecoveryKeys,
            priorAssistantMessages: params.priorAssistantMessages,
            syntheticApprovalRuntimeDependencies: params.syntheticApprovalRuntimeDependencies,
            defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
        }, dependencies);
        if (loopTurn.kind === "break") {
            break;
        }
        pendingLoopDirective = loopTurn.pendingLoopDirective;
        intakeProcessed = loopTurn.intakeProcessed;
        state = loopTurn.state;
    }
    return state;
}
//# sourceMappingURL=root-loop.js.map