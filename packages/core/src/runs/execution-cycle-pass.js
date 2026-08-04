import { dirname } from "node:path";
import { createInstructionRuntimeContext } from "../instructions/merge.js";
import { applyPostExecutionPassResult, applyRecoveryEntryPassResult, applyReviewCyclePassResult, } from "./loop-pass-application.js";
import { runExecutionAttemptPass, } from "./execution-attempt-pass.js";
import { runRecoveryEntryPass } from "./recovery-entry-pass.js";
import { runPostExecutionPass } from "./post-execution-pass.js";
import { runReviewCyclePass } from "./review-cycle-pass.js";
import { CanonicalExecutionFailure } from "./canonical-execution-failure.js";
const defaultModuleDependencies = {
    runExecutionAttemptPass,
    runRecoveryEntryPass,
    runPostExecutionPass,
    runReviewCyclePass,
    applyRecoveryEntryPassResult,
    applyPostExecutionPassResult,
    applyReviewCyclePassResult,
};
export async function runExecutionCyclePass(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    let preview = "";
    let failed = false;
    let aiRecovery = null;
    let workerRuntimeRecovery = null;
    let executionRecovery = null;
    const failedCommandTools = [];
    const successfulFileDeliveries = [
        ...(params.state.recoveredAttempt?.successfulFileDeliveries ?? []),
    ];
    const successfulTextDeliveries = [];
    let commandFailureSeen = false;
    let commandRecoveredWithinSamePass = false;
    let canonicalAttemptEvidenceRefs = [];
    const yeonjangSideEffectGoalValidationCandidates = [];
    const webExecutionState = params.state.webExecutionState ?? {
        discovery: { status: "not_attempted" },
        validatedEvidence: { status: "none" },
        observedFetchCandidates: [],
        observedSearchResults: [],
    };
    const recoveredAttempt = params.state.recoveredAttempt;
    const executionAttemptPass = recoveredAttempt
        ? {
            preview: recoveredAttempt.preview,
            previewSource: "runtime_deterministic",
            failed: false,
            executionRecoveryLimitStop: null,
            aiRecoveryLimitStop: null,
            aiRecovery: null,
            workerRuntimeRecovery: null,
            executionRecovery: null,
            sawRealFilesystemMutation: false,
            commandFailureSeen: false,
            commandRecoveredWithinSamePass: false,
        }
        : await moduleDependencies.runExecutionAttemptPass({
            artifactStorage: params.artifactStorage,
            memoryJournal: params.memoryJournal,
            config: params.config,
            runId: params.runId,
            sessionId: params.sessionId,
            source: params.source,
            onChunk: params.onChunk,
            ...(params.onDeliveryError ? { onDeliveryError: params.onDeliveryError } : {}),
            currentMessage: params.state.currentMessage,
            requiredToolNames: params.admittedCapabilityExecutionScope
                ? params.state.requiredToolNames.filter((toolName) => params.admittedCapabilityExecutionScope?.toolNames.includes(toolName))
                : params.state.requiredToolNames,
            completionConditions: params.completionConditions,
            ...(params.admittedCapabilityExecutionScope
                ? { admittedCapabilityExecutionScope: params.admittedCapabilityExecutionScope }
                : {}),
            webExecutionState,
            memorySearchQuery: params.memorySearchQuery,
            ...(params.scheduleId ? { scheduleId: params.scheduleId } : {}),
            ...(params.includeScheduleMemory ? { includeScheduleMemory: true } : {}),
            ...(params.state.currentModel ? { model: params.state.currentModel } : {}),
            ...(params.state.currentProviderId ? { providerId: params.state.currentProviderId } : {}),
            ...(params.state.currentProvider ? { provider: params.state.currentProvider } : {}),
            workDir: params.workDir,
            signal: params.signal,
            ...(params.toolsEnabled === false
                || params.state.nextAttemptToolPolicy?.mode === "forbidden"
                ? { toolsEnabled: false }
                : {}),
            isRootRequest: params.isRootRequest,
            requestGroupId: params.requestGroupId,
            contextMode: params.contextMode,
            preview,
            ...(params.state.activeWorkerRuntime
                ? { activeWorkerRuntime: params.state.activeWorkerRuntime }
                : {}),
            ...(params.workerSessionId ? { workerSessionId: params.workerSessionId } : {}),
            pendingToolParams: params.pendingToolParams,
            successfulTools: params.successfulTools,
            filesystemMutationPaths: params.filesystemMutationPaths,
            failedCommandTools,
            yeonjangSideEffectGoalValidationCandidates,
            successfulFileDeliveries,
            successfulTextDeliveries,
            commandFailureSeen,
            recoveryBudgetUsage: params.recoveryBudgetUsage,
            defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
            executionRecoveryLimitStop: params.state.executionRecoveryLimitStop,
            stopAfterDirectArtifactDeliverySuccess: params.wantsDirectArtifactDelivery,
            abortExecutionStream: () => { },
        }, {
            rememberRunFailure: dependencies.rememberRunFailure,
            incrementDelegationTurnCount: dependencies.incrementDelegationTurnCount,
            appendRunEvent: dependencies.appendRunEvent,
            updateRunSummary: dependencies.updateRunSummary,
            setRunStepStatus: dependencies.setRunStepStatus,
            updateRunStatus: dependencies.updateRunStatus,
            markAbortedRunCancelledIfActive: dependencies.markAbortedRunCancelledIfActive,
        });
    if (params.isRootRequest && !recoveredAttempt) {
        const canonicalAttempt = await dependencies.recordCanonicalAttempt({
            runId: params.runId,
            attempt: executionAttemptPass,
            successfulToolNames: params.successfulTools.map((tool) => tool.toolName),
        });
        if (!canonicalAttempt.ok) {
            throw new CanonicalExecutionFailure({
                phase: "execution",
                reasonCode: canonicalAttempt.reasonCode,
                retryable: false,
            });
        }
        canonicalAttemptEvidenceRefs = canonicalAttempt.evidenceRefs ?? [];
    }
    else if (recoveredAttempt) {
        canonicalAttemptEvidenceRefs = [
            ...recoveredAttempt.canonicalAttemptEvidenceRefs,
        ];
    }
    preview = executionAttemptPass.preview;
    failed = executionAttemptPass.failed;
    aiRecovery = executionAttemptPass.aiRecovery;
    workerRuntimeRecovery = executionAttemptPass.workerRuntimeRecovery;
    executionRecovery = executionAttemptPass.executionRecovery;
    commandFailureSeen = executionAttemptPass.commandFailureSeen;
    commandRecoveredWithinSamePass = executionAttemptPass.commandRecoveredWithinSamePass;
    const { recoveredAttempt: _consumedRecoveredAttempt, ...stateAfterRecoveredAttempt } = params.state;
    const nextStateFromAttempt = {
        ...stateAfterRecoveredAttempt,
        webExecutionState,
        executionRecoveryLimitStop: executionAttemptPass.executionRecoveryLimitStop,
        aiRecoveryLimitStop: executionAttemptPass.aiRecoveryLimitStop,
        sawRealFilesystemMutation: params.state.sawRealFilesystemMutation || executionAttemptPass.sawRealFilesystemMutation,
    };
    const recoveryEntryPass = await moduleDependencies.runRecoveryEntryPass({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        preview,
        executionRecoveryLimitStop: nextStateFromAttempt.executionRecoveryLimitStop,
        aiRecoveryLimitStop: nextStateFromAttempt.aiRecoveryLimitStop,
        recoveries: [
            { kind: "ai", payload: aiRecovery },
            { kind: "worker_runtime", payload: workerRuntimeRecovery },
        ],
        aborted: params.signal.aborted,
        failed,
        taskProfile: params.taskProfile,
        current: {
            model: nextStateFromAttempt.currentModel,
            providerId: nextStateFromAttempt.currentProviderId,
            provider: nextStateFromAttempt.currentProvider,
            targetId: nextStateFromAttempt.currentTargetId,
            targetLabel: nextStateFromAttempt.currentTargetLabel,
            workerRuntime: nextStateFromAttempt.activeWorkerRuntime,
        },
        seenKeys: params.seenAiRecoveryKeys,
        originalRequest: params.originalRequest,
        previousResult: preview,
        responseContext: {
            originalRequest: params.originalRequest,
            ...(params.responseLanguageMode
                ? { responseLanguageMode: params.responseLanguageMode }
                : {}),
            model: nextStateFromAttempt.currentModel,
            ...(nextStateFromAttempt.currentProviderId
                ? { providerId: nextStateFromAttempt.currentProviderId }
                : {}),
            ...(nextStateFromAttempt.currentProvider
                ? { provider: nextStateFromAttempt.currentProvider }
                : {}),
            config: params.config,
            workDir: params.workDir,
            ...(params.finalResponseIdentityContext
                ? { identityContext: params.finalResponseIdentityContext }
                : {}),
        },
        finalizationDependencies: dependencies.getFinalizationDependencies(),
    }, {
        appendRunEvent: dependencies.appendRunEvent,
    });
    const recoveryEntryApplication = moduleDependencies.applyRecoveryEntryPassResult({
        result: recoveryEntryPass,
        currentMessage: nextStateFromAttempt.currentMessage,
    });
    if (recoveryEntryApplication.kind === "break") {
        return { kind: "break" };
    }
    if (recoveryEntryApplication.kind === "retry") {
        if (params.isRootRequest) {
            const canonicalRecovery = await dependencies.recordCanonicalRecoveryReentry({
                runId: params.runId,
                previousResult: preview,
                strategy: {
                    message: recoveryEntryApplication.state.currentMessage,
                    ...(recoveryEntryApplication.state.currentModel
                        ? { model: recoveryEntryApplication.state.currentModel }
                        : {}),
                    ...(recoveryEntryApplication.state.currentProviderId
                        ? { providerId: recoveryEntryApplication.state.currentProviderId }
                        : {}),
                    ...(recoveryEntryApplication.state.currentTargetId
                        ? { targetId: recoveryEntryApplication.state.currentTargetId }
                        : {}),
                    ...(recoveryEntryApplication.state.currentTargetLabel
                        ? { targetLabel: recoveryEntryApplication.state.currentTargetLabel }
                        : {}),
                    ...(recoveryEntryApplication.state.activeWorkerRuntime?.kind
                        ? { workerRuntimeKind: recoveryEntryApplication.state.activeWorkerRuntime.kind }
                        : {}),
                },
            });
            if (!canonicalRecovery.ok) {
                throw new CanonicalExecutionFailure({
                    phase: "recovery",
                    reasonCode: canonicalRecovery.reasonCode,
                    retryable: true,
                });
            }
        }
        return {
            kind: "retry",
            state: {
                ...nextStateFromAttempt,
                ...recoveryEntryApplication.state,
            },
        };
    }
    const { usedTurns, maxTurns } = dependencies.getDelegationTurnState();
    const postExecutionPass = await moduleDependencies.runPostExecutionPass({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        preview,
        ...(executionAttemptPass.previewSource
            ? { previewSource: executionAttemptPass.previewSource }
            : {}),
        ...(executionAttemptPass.deferredPreviewDelivery ? { deferredPreviewDelivery: true } : {}),
        originalRequest: params.originalRequest,
        verificationRequest: params.verificationRequest,
        wantsDirectArtifactDelivery: params.wantsDirectArtifactDelivery,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        activeWorkerRuntime: Boolean(nextStateFromAttempt.activeWorkerRuntime),
        ...(params.workerSessionId ? { workerSessionId: params.workerSessionId } : {}),
        successfulFileDeliveries,
        successfulTextDeliveries,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: nextStateFromAttempt.sawRealFilesystemMutation,
        filesystemMutationRecoveryAttempted: nextStateFromAttempt.filesystemMutationRecoveryAttempted,
        mutationPaths: [...params.filesystemMutationPaths],
        failedCommandTools,
        commandFailureSeen,
        commandRecoveredWithinSamePass,
        executionRecovery,
        seenCommandFailureRecoveryKeys: params.seenCommandFailureRecoveryKeys,
        seenExecutionRecoveryKeys: params.seenExecutionRecoveryKeys,
        seenDeliveryRecoveryKeys: params.seenDeliveryRecoveryKeys,
        recoveryBudgetUsage: params.recoveryBudgetUsage,
        usedTurns,
        maxDelegationTurns: maxTurns,
    }, {
        rememberRunFailure: dependencies.rememberRunFailure,
        incrementDelegationTurnCount: dependencies.incrementDelegationTurnCount,
        appendRunEvent: dependencies.appendRunEvent,
        updateRunSummary: dependencies.updateRunSummary,
        setRunStepStatus: dependencies.setRunStepStatus,
        updateRunStatus: dependencies.updateRunStatus,
        getFinalizationDependencies: dependencies.getFinalizationDependencies,
        insertMessage: dependencies.insertMessage,
        writeReplyLog: dependencies.writeReplyLog,
        createId: dependencies.createId,
        now: dependencies.now,
        runVerificationSubtask: dependencies.runVerificationSubtask,
    });
    const postExecutionApplication = moduleDependencies.applyPostExecutionPassResult({
        result: postExecutionPass,
        currentMessage: nextStateFromAttempt.currentMessage,
        filesystemMutationRecoveryAttempted: nextStateFromAttempt.filesystemMutationRecoveryAttempted,
        activeWorkerRuntime: nextStateFromAttempt.activeWorkerRuntime,
        seenCommandFailureRecoveryKeys: params.seenCommandFailureRecoveryKeys,
        seenExecutionRecoveryKeys: params.seenExecutionRecoveryKeys,
        seenDeliveryRecoveryKeys: params.seenDeliveryRecoveryKeys,
    });
    if (postExecutionApplication.kind === "break") {
        return { kind: "break" };
    }
    if (postExecutionApplication.kind === "retry") {
        if (params.isRootRequest) {
            const canonicalRecovery = await dependencies.recordCanonicalRecoveryReentry({
                runId: params.runId,
                previousResult: preview,
                strategy: {
                    message: postExecutionApplication.state.currentMessage,
                    ...(nextStateFromAttempt.currentModel
                        ? { model: nextStateFromAttempt.currentModel }
                        : {}),
                    ...(nextStateFromAttempt.currentProviderId
                        ? { providerId: nextStateFromAttempt.currentProviderId }
                        : {}),
                    ...(nextStateFromAttempt.currentTargetId
                        ? { targetId: nextStateFromAttempt.currentTargetId }
                        : {}),
                    ...(nextStateFromAttempt.currentTargetLabel
                        ? { targetLabel: nextStateFromAttempt.currentTargetLabel }
                        : {}),
                    ...(postExecutionApplication.state.activeWorkerRuntime?.kind
                        ? { workerRuntimeKind: postExecutionApplication.state.activeWorkerRuntime.kind }
                        : {}),
                },
            });
            if (!canonicalRecovery.ok) {
                throw new CanonicalExecutionFailure({
                    phase: "recovery",
                    reasonCode: canonicalRecovery.reasonCode,
                    retryable: true,
                });
            }
        }
        return {
            kind: "retry",
            state: {
                ...nextStateFromAttempt,
                currentMessage: postExecutionApplication.state.currentMessage,
                filesystemMutationRecoveryAttempted: postExecutionApplication.state.filesystemMutationRecoveryAttempted,
                activeWorkerRuntime: postExecutionApplication.state.activeWorkerRuntime,
            },
        };
    }
    const reviewOutcomePass = await moduleDependencies.runReviewCyclePass({
        instructionRuntime: createInstructionRuntimeContext(dirname(params.memoryJournal.memoryDbFile)),
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        signal: params.signal,
        preview: postExecutionApplication.preview,
        ...(postExecutionApplication.previewSource
            ? { previewSource: postExecutionApplication.previewSource }
            : {}),
        ...(postExecutionApplication.deferredPreviewDelivery
            ? { deferredPreviewDelivery: true }
            : {}),
        priorAssistantMessages: params.priorAssistantMessages,
        executionSemantics: params.executionSemantics,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        originalRequest: params.originalRequest,
        ...(params.responseLanguageMode ? { responseLanguageMode: params.responseLanguageMode } : {}),
        ...(nextStateFromAttempt.currentModel ? { model: nextStateFromAttempt.currentModel } : {}),
        ...(nextStateFromAttempt.currentProviderId
            ? { providerId: nextStateFromAttempt.currentProviderId }
            : {}),
        ...(nextStateFromAttempt.currentProvider
            ? { provider: nextStateFromAttempt.currentProvider }
            : {}),
        config: params.config,
        workDir: params.workDir,
        ...(params.finalResponseIdentityContext
            ? { finalResponseIdentityContext: params.finalResponseIdentityContext }
            : {}),
        usesWorkerRuntime: Boolean(postExecutionApplication.state.activeWorkerRuntime),
        ...(postExecutionApplication.state.activeWorkerRuntime?.kind
            ? { workerRuntimeKind: postExecutionApplication.state.activeWorkerRuntime.kind }
            : {}),
        requiresPrivilegedToolExecution: params.requiresPrivilegedToolExecution,
        deliveryOutcome: postExecutionApplication.deliveryOutcome,
        successfulTools: params.successfulTools,
        ...((nextStateFromAttempt.requiredToolNames ?? []).length > 0
            ? { requiresSuccessfulToolEvidence: true }
            : {}),
        yeonjangSideEffectGoalValidationCandidates,
        completionConditions: params.completionConditions,
        ...(canonicalAttemptEvidenceRefs.length > 0
            ? { canonicalAttemptEvidenceRefs }
            : {}),
        successfulFileDeliveries,
        sawRealFilesystemMutation: nextStateFromAttempt.sawRealFilesystemMutation,
        truncatedOutputRecoveryAttempted: nextStateFromAttempt.truncatedOutputRecoveryAttempted,
        recoveryBudgetUsage: params.recoveryBudgetUsage,
        defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
        seenFollowupPrompts: params.seenFollowupPrompts,
        syntheticApprovalAlreadyApproved: params.syntheticApprovalAlreadyApproved,
        approvalRequired: params.executionSemantics.approvalRequired,
        approvalTool: params.executionSemantics.approvalTool,
        syntheticApprovalRuntimeDependencies: params.syntheticApprovalRuntimeDependencies,
        finalizationDependencies: dependencies.getFinalizationDependencies(),
        ...(params.isRootRequest
            ? {
                recordCanonicalCompletionOutcome: dependencies.recordCanonicalCompletionOutcome,
                recordCanonicalDelivery: dependencies.recordCanonicalDelivery,
                stageCanonicalPendingResponse: dependencies.stageCanonicalPendingResponse,
                consumeCanonicalPendingResponse: dependencies.consumeCanonicalPendingResponse,
            }
            : {}),
    }, {
        rememberRunApprovalScope: dependencies.rememberRunApprovalScope,
        grantRunApprovalScope: dependencies.grantRunApprovalScope,
        grantRunSingleApproval: dependencies.grantRunSingleApproval,
        rememberRunFailure: dependencies.rememberRunFailure,
        incrementDelegationTurnCount: dependencies.incrementDelegationTurnCount,
        appendRunEvent: dependencies.appendRunEvent,
        updateRunSummary: dependencies.updateRunSummary,
        setRunStepStatus: dependencies.setRunStepStatus,
        updateRunStatus: dependencies.updateRunStatus,
        ...(dependencies.onReviewError ? { onReviewError: dependencies.onReviewError } : {}),
    });
    const reviewCycleApplication = moduleDependencies.applyReviewCyclePassResult({
        result: reviewOutcomePass,
        currentMessage: postExecutionApplication.state.currentMessage,
        truncatedOutputRecoveryAttempted: nextStateFromAttempt.truncatedOutputRecoveryAttempted,
        activeWorkerRuntime: postExecutionApplication.state.activeWorkerRuntime,
        currentProvider: nextStateFromAttempt.currentProvider,
        seenFollowupPrompts: params.seenFollowupPrompts,
    });
    if (reviewCycleApplication.kind === "retry") {
        if (params.isRootRequest) {
            const canonicalRecovery = await dependencies.recordCanonicalRecoveryReentry({
                runId: params.runId,
                previousResult: postExecutionApplication.preview,
                strategy: {
                    message: reviewCycleApplication.state.currentMessage,
                    ...(nextStateFromAttempt.currentModel
                        ? { model: nextStateFromAttempt.currentModel }
                        : {}),
                    ...(nextStateFromAttempt.currentProviderId
                        ? { providerId: nextStateFromAttempt.currentProviderId }
                        : {}),
                    ...(nextStateFromAttempt.currentTargetId
                        ? { targetId: nextStateFromAttempt.currentTargetId }
                        : {}),
                    ...(nextStateFromAttempt.currentTargetLabel
                        ? { targetLabel: nextStateFromAttempt.currentTargetLabel }
                        : {}),
                    ...(reviewCycleApplication.state.activeWorkerRuntime?.kind
                        ? { workerRuntimeKind: reviewCycleApplication.state.activeWorkerRuntime.kind }
                        : {}),
                },
            });
            if (!canonicalRecovery.ok) {
                throw new CanonicalExecutionFailure({
                    phase: "recovery",
                    reasonCode: canonicalRecovery.reasonCode,
                    retryable: true,
                });
            }
        }
        return {
            kind: "retry",
            state: {
                ...nextStateFromAttempt,
                currentMessage: reviewCycleApplication.state.currentMessage,
                requiredToolNames: reviewCycleApplication.state.requiredToolNames
                    ?? nextStateFromAttempt.requiredToolNames,
                ...(reviewCycleApplication.state.nextAttemptToolPolicy
                    ? { nextAttemptToolPolicy: reviewCycleApplication.state.nextAttemptToolPolicy }
                    : {}),
                activeWorkerRuntime: reviewCycleApplication.state.activeWorkerRuntime,
                currentProvider: reviewCycleApplication.state.currentProvider,
                filesystemMutationRecoveryAttempted: postExecutionApplication.state.filesystemMutationRecoveryAttempted,
                truncatedOutputRecoveryAttempted: reviewCycleApplication.state.truncatedOutputRecoveryAttempted,
            },
        };
    }
    return { kind: "break" };
}
//# sourceMappingURL=execution-cycle-pass.js.map