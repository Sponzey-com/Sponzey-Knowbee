import { buildCommandFailureRecoveryPrompt, buildExecutionRecoveryPrompt, selectCommandFailureRecovery, selectGenericExecutionRecovery, } from "./recovery.js";
export function decideExecutionPostPassRecovery(params) {
    if (params.directArtifactDeliverySatisfied) {
        return { kind: "none" };
    }
    const commandFailureRecovery = selectCommandFailureRecovery({
        failedTools: params.failedCommandTools,
        commandFailureSeen: params.commandFailureSeen,
        commandRecoveredWithinSamePass: params.commandRecoveredWithinSamePass,
        seenKeys: params.seenCommandFailureRecoveryKeys,
    });
    if (commandFailureRecovery) {
        return {
            kind: "retry",
            seenKeyKind: "command",
            seenKey: commandFailureRecovery.key,
            state: {
                summary: commandFailureRecovery.summary,
                budgetKind: "execution",
                maxDelegationTurns: params.maxDelegationTurns,
                eventLabel: "명령 실패 대안 재시도",
                nextMessage: buildCommandFailureRecoveryPrompt({
                    originalRequest: params.originalRequest,
                    previousResult: params.preview,
                    summary: commandFailureRecovery.summary,
                    reason: commandFailureRecovery.reason,
                    failedTools: params.failedCommandTools,
                    alternatives: commandFailureRecovery.alternatives,
                }),
                reviewStepStatus: "running",
                executingStepSummary: commandFailureRecovery.summary,
                updateRunStatusSummary: commandFailureRecovery.summary,
                updateRunSummary: commandFailureRecovery.summary,
                clearWorkerRuntime: true,
                alternatives: commandFailureRecovery.alternatives,
                failureTitle: "command_failure_recovery",
                failureDetail: commandFailureRecovery.reason,
            },
        };
    }
    if (params.commandFailureSeen && !params.commandRecoveredWithinSamePass && params.failedCommandTools.length > 0) {
        return { kind: "none" };
    }
    const genericExecutionRecovery = params.executionRecovery
        ? selectGenericExecutionRecovery({
            executionRecovery: params.executionRecovery,
            seenKeys: params.seenExecutionRecoveryKeys,
        })
        : null;
    if (!genericExecutionRecovery && params.executionRecovery) {
        return { kind: "none" };
    }
    if (!genericExecutionRecovery) {
        return { kind: "none" };
    }
    return {
        kind: "retry",
        seenKeyKind: "generic_execution",
        seenKey: genericExecutionRecovery.key,
        state: {
            summary: genericExecutionRecovery.summary,
            budgetKind: "execution",
            maxDelegationTurns: params.maxDelegationTurns,
            eventLabel: "도구 실패 대안 재시도",
            nextMessage: buildExecutionRecoveryPrompt({
                originalRequest: params.originalRequest,
                previousResult: params.preview,
                summary: genericExecutionRecovery.summary,
                reason: genericExecutionRecovery.reason,
                toolNames: params.executionRecovery?.toolNames ?? [],
                ...(params.executionRecovery?.reasonCode
                    ? { reasonCode: params.executionRecovery.reasonCode }
                    : {}),
                ...(params.executionRecovery?.evidenceRefs
                    ? { evidenceRefs: params.executionRecovery.evidenceRefs }
                    : {}),
                alternatives: genericExecutionRecovery.alternatives,
            }),
            reviewStepStatus: "running",
            executingStepSummary: genericExecutionRecovery.summary,
            updateRunStatusSummary: genericExecutionRecovery.summary,
            updateRunSummary: genericExecutionRecovery.summary,
            clearWorkerRuntime: true,
            alternatives: genericExecutionRecovery.alternatives,
            failureTitle: "execution_recovery_followup",
            failureDetail: genericExecutionRecovery.reason,
        },
    };
}
//# sourceMappingURL=execution-postpass.js.map