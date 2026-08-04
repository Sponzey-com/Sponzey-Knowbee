import { getDb } from "../db/index.js";
import { createFileBackedDiagnosisProvider } from "../orchestration/prompt-policy-adapter.js";
import { getRootRun } from "./store.js";
import { buildCompletionReviewOperationalEvidence, defaultReviewPassDependencies, runReviewPass, } from "./review-pass.js";
import { runReviewOutcomePass, } from "./review-outcome-pass.js";
import { decideReviewGate } from "./review-gate.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
import { buildStructuredFollowupKey } from "./completion-application.js";
import { resolveRuntimeToolMetadataFromDispatcher, validateAndAppendYeonjangSideEffectGoalValidationEvidence, } from "../yeonjang/side-effect-goal-validation-review.js";
import { enforceDirectArtifactDeliveryFollowup } from "./direct-artifact-delivery-followup.js";
const defaultModuleDependencies = {
    decideReviewGate,
    runReviewPass,
    runReviewOutcomePass,
    getRootRun,
    getDb,
    createFileBackedDiagnosisProvider,
    validateAndAppendYeonjangSideEffectGoalValidationEvidence,
    resolveRuntimeToolMetadataFromDispatcher,
};
function buildReviewResponseContext(params) {
    if (!params.originalRequest.trim() || !params.model?.trim() || !params.workDir?.trim())
        return undefined;
    if (!params.provider && !params.providerId?.trim())
        return undefined;
    return {
        originalRequest: params.originalRequest,
        ...(params.responseLanguageMode
            ? { responseLanguageMode: params.responseLanguageMode }
            : {}),
        model: params.model,
        ...(params.providerId ? { providerId: params.providerId } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        config: params.config,
        workDir: params.workDir,
        ...(params.finalResponseIdentityContext
            ? { identityContext: params.finalResponseIdentityContext }
            : {}),
    };
}
export function buildSubSessionFeedbackCycleDirective(feedback) {
    return {
        kind: "retry_sub_session",
        subSessionId: feedback.subSessionId,
        normalizedFailureKey: feedback.reasonCode,
        missingItems: [...feedback.missingItems],
        requiredChanges: [...feedback.requiredChanges],
        followupPrompt: [
            `Revise sub-session ${feedback.subSessionId}.`,
            `Reason key: ${feedback.reasonCode}`,
            feedback.missingItems.length ? `Missing items:\n- ${feedback.missingItems.join("\n- ")}` : "",
            feedback.requiredChanges.length ? `Required changes:\n- ${feedback.requiredChanges.join("\n- ")}` : "",
            feedback.additionalContextRefs.length ? `Additional context refs:\n- ${feedback.additionalContextRefs.join("\n- ")}` : "",
            loadPromptValue("review_cycle_followup_result_report_instruction_user", {}, { required: true }),
        ].filter(Boolean).join("\n\n"),
    };
}
function resolveReviewCycleDiagnosisProvider(params, moduleDependencies) {
    if (params.diagnosisProvider)
        return params.diagnosisProvider;
    if (!params.provider || !params.model?.trim() || !params.workDir?.trim())
        return undefined;
    try {
        return (moduleDependencies.createFileBackedDiagnosisProvider ?? createFileBackedDiagnosisProvider)({
            provider: params.provider,
            model: params.model,
            workDir: params.workDir,
            locale: params.finalResponseIdentityContext?.promptLocale ?? "en",
            observabilityContext: {
                runId: params.runId,
                ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
                sessionId: params.sessionId,
            },
        });
    }
    catch {
        return undefined;
    }
}
export async function runReviewCyclePass(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const goalValidationCandidates = params.yeonjangSideEffectGoalValidationCandidates ?? [];
    const yeonjangGoalValidationStateChanges = [];
    if (goalValidationCandidates.length > 0) {
        const diagnosisProvider = resolveReviewCycleDiagnosisProvider(params, moduleDependencies);
        const appendValidation = moduleDependencies.validateAndAppendYeonjangSideEffectGoalValidationEvidence
            ?? validateAndAppendYeonjangSideEffectGoalValidationEvidence;
        const resolveToolMetadata = moduleDependencies.resolveRuntimeToolMetadataFromDispatcher
            ?? resolveRuntimeToolMetadataFromDispatcher;
        const validation = await appendValidation({
            db: (moduleDependencies.getDb ?? getDb)(),
            ...(diagnosisProvider ? { provider: diagnosisProvider } : {}),
            runId: params.runId,
            ownerAgentName: params.finalResponseIdentityContext?.mainAgentSelfName ?? "Knowbee (노비)",
            originalRequest: params.originalRequest,
            completionConditions: params.completionConditions,
            candidates: goalValidationCandidates,
            successfulTools: params.successfulTools,
            resolveToolMetadata,
        });
        if (validation.added > 0) {
            dependencies.appendRunEvent(params.runId, `yeonjang_side_effect_goal_validation_added:${validation.added}`);
        }
        for (const skipped of validation.skipped) {
            yeonjangGoalValidationStateChanges.push({
                stateRef: [
                    "yeonjang-goal-validation",
                    skipped.toolName,
                    skipped.reasonCode,
                    skipped.detail,
                ].filter(Boolean).join(":"),
                targetRef: `tool:${skipped.toolName}:side-effect-goal`,
                status: "not_observed",
            });
            dependencies.appendRunEvent(params.runId, `yeonjang_side_effect_goal_validation_skipped:${skipped.toolName}:${skipped.reasonCode}`);
        }
    }
    const baseOperationalEvidence = buildCompletionReviewOperationalEvidence({
        successfulFileDeliveries: params.successfulFileDeliveries,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        deliveryOutcome: params.deliveryOutcome,
    });
    const operationalEvidence = {
        ...baseOperationalEvidence,
        stateChanges: [
            ...baseOperationalEvidence.stateChanges,
            ...(params.canonicalAttemptEvidenceRefs ?? []).map((stateRef) => ({
                stateRef,
                targetRef: `run:${params.runId}:attempt`,
                status: "observed",
            })),
            ...yeonjangGoalValidationStateChanges,
        ],
    };
    const reviewGate = moduleDependencies.decideReviewGate({
        executionSemantics: params.executionSemantics,
        preview: params.preview,
        deliveryOutcome: params.deliveryOutcome,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
    });
    // A direct artifact delivery is an already-admitted deterministic next step.
    // Do not ask completion review to assess a delivery receipt before the
    // delivery tool has been allowed to create one.
    const directDeliveryFollowup = enforceDirectArtifactDeliveryFollowup({
        source: params.source,
        deliveryOutcome: params.deliveryOutcome,
        successfulTools: params.successfulTools,
        review: null,
    });
    const reviewPass = directDeliveryFollowup
        ? {
            review: directDeliveryFollowup,
            syntheticApproval: null,
        }
        : reviewGate.kind === "skip"
            ? {
                review: null,
                syntheticApproval: null,
            }
            : await moduleDependencies.runReviewPass({
                instructionRuntime: params.instructionRuntime,
                runId: params.runId,
                sessionId: params.sessionId,
                executionProfile: {
                    approvalRequired: params.approvalRequired,
                    approvalTool: params.approvalTool,
                },
                originalRequest: params.originalRequest,
                preview: params.preview,
                priorAssistantMessages: params.priorAssistantMessages,
                ...(params.model ? { model: params.model } : {}),
                ...(params.providerId ? { providerId: params.providerId } : {}),
                ...(params.provider ? { provider: params.provider } : {}),
                config: params.config,
                ...(params.workDir ? { workDir: params.workDir } : {}),
                usesWorkerRuntime: params.usesWorkerRuntime,
                requiresPrivilegedToolExecution: params.requiresPrivilegedToolExecution,
                successfulTools: params.successfulTools,
                ...(params.requiresSuccessfulToolEvidence
                    ? { requiresSuccessfulToolEvidence: true }
                    : {}),
                completionConditions: params.completionConditions,
                seenFollowupTransitionKeys: params.seenFollowupPrompts,
                operationalEvidence,
                successfulFileDeliveries: params.successfulFileDeliveries,
                sawRealFilesystemMutation: params.sawRealFilesystemMutation,
                deliveryOutcome: params.deliveryOutcome,
            }, {
                ...defaultReviewPassDependencies,
                ...(dependencies.onReviewError ? { onReviewError: dependencies.onReviewError } : {}),
                onReviewRejected: (reasonCode, attempt) => {
                    dependencies.appendRunEvent(params.runId, `completion_review_rejected:${reasonCode}:attempt_${attempt}`);
                },
            });
    const review = directDeliveryFollowup ?? enforceDirectArtifactDeliveryFollowup({
        source: params.source,
        deliveryOutcome: params.deliveryOutcome,
        successfulTools: params.successfulTools,
        review: reviewPass.review,
    });
    if (review !== reviewPass.review) {
        dependencies.appendRunEvent(params.runId, "direct_artifact_delivery_followup_enforced");
    }
    params.priorAssistantMessages.push(params.preview);
    if (reviewPass.reviewFailureReasonCode) {
        dependencies.appendRunEvent(params.runId, `completion_review_terminal_failure:${reviewPass.reviewFailureReasonCode}`);
    }
    const currentRun = moduleDependencies.getRootRun(params.runId);
    const structuredFollowupKey = review?.status === "followup" && review.followupPrompt?.trim()
        ? buildStructuredFollowupKey({
            kind: "followup",
            summary: review.summary || "Follow-up required.",
            reason: review.reason || "",
            remainingItems: review.remainingItems ?? [],
            followupPrompt: review.followupPrompt,
            followupEvidenceRefs: review.followupEvidenceRefs ?? [],
            evidenceRevisionRefs: review.contextReceipt?.evidenceRefs
                ?? review.followupEvidenceRefs
                ?? [],
            ...(review.followupExecutionMode
                ? { followupExecutionMode: review.followupExecutionMode }
                : {}),
            ...(review.followupRequiredToolNames?.length
                ? { followupRequiredToolNames: review.followupRequiredToolNames }
                : {}),
            ...(review.followupTargetRefs?.length
                ? { followupTargetRefs: review.followupTargetRefs }
                : {}),
        }, review.contextReceipt?.evidenceRefs)
        : undefined;
    return moduleDependencies.runReviewOutcomePass({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        onChunk: params.onChunk,
        signal: params.signal,
        preview: params.preview,
        ...(params.previewSource ? { previewSource: params.previewSource } : {}),
        ...(params.deferredPreviewDelivery ? { deferredPreviewDelivery: true } : {}),
        review,
        ...(reviewPass.reviewFailureReasonCode
            ? { reviewFailureReasonCode: reviewPass.reviewFailureReasonCode }
            : {}),
        syntheticApproval: reviewPass.syntheticApproval,
        executionSemantics: params.executionSemantics,
        deliveryOutcome: params.deliveryOutcome,
        successfulTools: params.successfulTools,
        completionConditions: params.completionConditions,
        operationalEvidence,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
        originalRequest: params.originalRequest,
        recoveryBudgetUsage: params.recoveryBudgetUsage,
        ...(buildReviewResponseContext(params) ? { responseContext: buildReviewResponseContext(params) } : {}),
        ...(typeof currentRun?.delegationTurnCount === "number"
            ? { delegationTurnCount: currentRun.delegationTurnCount }
            : {}),
        ...(typeof currentRun?.maxDelegationTurns === "number"
            ? { maxDelegationTurns: currentRun.maxDelegationTurns }
            : {}),
        defaultMaxDelegationTurns: params.defaultMaxDelegationTurns,
        followupPromptSeen: Boolean(structuredFollowupKey && params.seenFollowupPrompts.has(structuredFollowupKey)),
        syntheticApprovalAlreadyApproved: params.syntheticApprovalAlreadyApproved,
        syntheticApprovalSourceLabel: params.workerRuntimeKind ?? "agent_reply",
        syntheticApprovalRuntimeDependencies: params.syntheticApprovalRuntimeDependencies,
        finalizationDependencies: params.finalizationDependencies,
        ...(params.recordCanonicalCompletionOutcome
            ? { recordCanonicalCompletionOutcome: params.recordCanonicalCompletionOutcome }
            : {}),
        ...(params.recordCanonicalDelivery
            ? { recordCanonicalDelivery: params.recordCanonicalDelivery }
            : {}),
        ...(params.stageCanonicalPendingResponse
            ? { stageCanonicalPendingResponse: params.stageCanonicalPendingResponse }
            : {}),
        ...(params.consumeCanonicalPendingResponse
            ? { consumeCanonicalPendingResponse: params.consumeCanonicalPendingResponse }
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
    });
}
//# sourceMappingURL=review-cycle-pass.js.map