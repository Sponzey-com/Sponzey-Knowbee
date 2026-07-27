import { buildCompletionReviewContextReceipt, buildCompletionReviewExpectedConditions, } from "../agent/completion-review.js";
import { applySyntheticApprovalContinuation } from "./approval-application.js";
import { runSyntheticApprovalPass } from "./approval-pass.js";
import { applyCompletionApplicationPass } from "./completion-application-pass.js";
import { runCompletionPass } from "./completion-pass.js";
import { buildStructuredFollowupKey } from "./completion-application.js";
import { buildCanonicalCompletionOutcomeDescriptor, } from "./canonical-finalization-lifecycle.js";
import { CanonicalExecutionFailure } from "./canonical-execution-failure.js";
import { buildCanonicalCompletionBlockedReport, buildCanonicalCompletionExhaustedReport, } from "./canonical-runtime-result-report.js";
const defaultModuleDependencies = {
    runSyntheticApprovalPass,
    applySyntheticApprovalContinuation,
    runCompletionPass,
    applyCompletionApplicationPass,
};
export async function runReviewOutcomePass(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    if (params.syntheticApproval) {
        const continuation = await moduleDependencies.runSyntheticApprovalPass({
            request: params.syntheticApproval,
            runId: params.runId,
            sessionId: params.sessionId,
            signal: params.signal,
            alreadyApproved: params.syntheticApprovalAlreadyApproved,
            sourceLabel: params.syntheticApprovalSourceLabel,
            originalRequest: params.originalRequest,
            latestAssistantMessage: params.preview,
            runtimeDependencies: params.syntheticApprovalRuntimeDependencies,
        });
        const approvalApplication = moduleDependencies.applySyntheticApprovalContinuation({
            runId: params.runId,
            continuation,
            aborted: params.signal.aborted,
        }, dependencies);
        if (approvalApplication.kind === "stop") {
            return { kind: "break" };
        }
        return {
            kind: "retry",
            nextMessage: approvalApplication.nextMessage,
            clearWorkerRuntime: approvalApplication.clearWorkerRuntime,
            ...(approvalApplication.clearProvider ? { clearProvider: approvalApplication.clearProvider } : {}),
        };
    }
    const structuredFollowupKey = params.review?.status === "followup" && params.review.followupPrompt?.trim()
        ? buildStructuredFollowupKey({
            kind: "followup",
            summary: params.review.summary || "Follow-up required.",
            reason: params.review.reason,
            remainingItems: params.review.remainingItems,
            followupPrompt: params.review.followupPrompt,
            followupEvidenceRefs: params.review.followupEvidenceRefs ?? [],
            evidenceRevisionRefs: params.review.contextReceipt?.evidenceRefs
                ?? params.review.followupEvidenceRefs
                ?? [],
            ...(params.review.followupExecutionMode
                ? { followupExecutionMode: params.review.followupExecutionMode }
                : {}),
            ...(params.review.followupRequiredToolNames?.length
                ? { followupRequiredToolNames: params.review.followupRequiredToolNames }
                : {}),
            ...(params.review.followupTargetRefs?.length
                ? { followupTargetRefs: params.review.followupTargetRefs }
                : {}),
        }, params.review.contextReceipt?.evidenceRefs)
        : undefined;
    const completionPass = moduleDependencies.runCompletionPass({
        goalId: params.runId,
        review: params.review,
        ...(params.reviewFailureReasonCode
            ? { reviewFailureReasonCode: params.reviewFailureReasonCode }
            : {}),
        executionSemantics: params.executionSemantics,
        preview: params.preview,
        deliveryOutcome: params.deliveryOutcome,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
        originalRequest: params.originalRequest,
        recoveryBudgetUsage: params.recoveryBudgetUsage,
        ...(typeof params.delegationTurnCount === "number"
            ? { delegationTurnCount: params.delegationTurnCount }
            : {}),
        ...(typeof params.maxDelegationTurns === "number"
            ? { maxDelegationTurns: params.maxDelegationTurns }
            : {}),
        defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
        followupAlreadySeen: params.followupPromptSeen,
    });
    let canonicalFinalOutcome;
    let terminalReport;
    if (params.recordCanonicalCompletionOutcome) {
        const expectedLlmDiagnosisContext = buildCompletionReviewContextReceipt({
            originalRequest: params.originalRequest,
            latestAssistantMessage: params.preview,
            successfulTools: params.successfulTools,
            ...(params.operationalEvidence
                ? { operationalEvidence: params.operationalEvidence }
                : {}),
            completionConditions: params.completionConditions,
        });
        const requiresLlmResultDiagnosis = params.review !== null && expectedLlmDiagnosisContext.evidenceRefs.length > 0;
        const built = buildCanonicalCompletionOutcomeDescriptor({
            runId: params.runId,
            review: params.review,
            requiresLlmResultDiagnosis,
            ...(requiresLlmResultDiagnosis
                ? {
                    expectedLlmDiagnosisContext,
                    expectedLlmDiagnosisConditions: buildCompletionReviewExpectedConditions(params.completionConditions),
                }
                : {}),
            state: completionPass.state,
            application: completionPass.application,
            preview: params.preview,
        });
        if (!built.ok) {
            throw new CanonicalExecutionFailure({
                phase: "review",
                reasonCode: built.reasonCode,
                retryable: false,
            });
        }
        if (built.descriptor) {
            const recorded = await params.recordCanonicalCompletionOutcome(built.descriptor);
            if (!recorded.ok) {
                throw new CanonicalExecutionFailure({
                    phase: "review",
                    reasonCode: recorded.reasonCode,
                    retryable: false,
                });
            }
            if (built.descriptor.event === "PATHS_EXHAUSTED") {
                canonicalFinalOutcome = "exhausted";
                terminalReport = buildCanonicalCompletionExhaustedReport({
                    runId: params.runId,
                    primaryLanguage: params.responseContext?.identityContext?.promptLocale === "ko" ? "ko" : "en",
                    evidenceRefs: built.descriptor.receipt.evidenceRefs,
                });
            }
            else if (built.descriptor.event === "RESULT_BLOCKED") {
                canonicalFinalOutcome = "blocked";
                terminalReport = buildCanonicalCompletionBlockedReport({
                    runId: params.runId,
                    primaryLanguage: params.responseContext?.identityContext?.promptLocale === "ko" ? "ko" : "en",
                    evidenceRefs: built.descriptor.receipt.evidenceRefs,
                });
            }
        }
    }
    const completionApplicationPass = await moduleDependencies.applyCompletionApplicationPass({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        preview: params.preview,
        ...(params.previewSource ? { previewSource: params.previewSource } : {}),
        ...(params.deferredPreviewDelivery ? { deferredPreviewDelivery: true } : {}),
        state: completionPass.state,
        application: completionPass.application,
        maxTurns: completionPass.maxTurns,
        recoveryBudgetUsage: params.recoveryBudgetUsage,
        ...(params.responseContext ? { responseContext: params.responseContext } : {}),
        finalizationDependencies: params.finalizationDependencies,
        ...(params.recordCanonicalDelivery
            ? { recordCanonicalDelivery: params.recordCanonicalDelivery }
            : {}),
        ...(params.stageCanonicalPendingResponse
            ? { stageCanonicalPendingResponse: params.stageCanonicalPendingResponse }
            : {}),
        ...(params.consumeCanonicalPendingResponse
            ? { consumeCanonicalPendingResponse: params.consumeCanonicalPendingResponse }
            : {}),
        ...(canonicalFinalOutcome ? { canonicalFinalOutcome } : {}),
        ...(terminalReport ? { terminalReport } : {}),
    }, dependencies);
    if (completionApplicationPass.kind === "retry") {
        return {
            kind: "retry",
            nextMessage: completionApplicationPass.nextMessage,
            clearWorkerRuntime: completionApplicationPass.clearWorkerRuntime,
            ...(completionApplicationPass.structuredFollowupKey
                ? { structuredFollowupKey: completionApplicationPass.structuredFollowupKey }
                : structuredFollowupKey
                    ? { structuredFollowupKey }
                    : {}),
            ...(completionApplicationPass.markTruncatedOutputRecoveryAttempted
                ? { markTruncatedOutputRecoveryAttempted: completionApplicationPass.markTruncatedOutputRecoveryAttempted }
                : {}),
            ...(completionApplicationPass.requiredToolNames !== undefined
                ? { requiredToolNames: completionApplicationPass.requiredToolNames }
                : {}),
            ...(completionApplicationPass.nextAttemptToolPolicy
                ? { nextAttemptToolPolicy: completionApplicationPass.nextAttemptToolPolicy }
                : {}),
        };
    }
    return { kind: "break" };
}
//# sourceMappingURL=review-outcome-pass.js.map