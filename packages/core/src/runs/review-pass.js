import { reviewTaskCompletion } from "../agent/completion-review.js";
import { redactLogText } from "../logger/index.js";
import { sanitizeUserFacingError } from "./error-sanitizer.js";
import { detectSyntheticApprovalRequest, } from "./approval.js";
export function buildCompletionReviewOperationalEvidence(input) {
    const artifacts = input.successfulFileDeliveries.map((delivery) => {
        const providerReceipt = delivery.deliveryReceipts?.find((receipt) => receipt.status === "sent" || receipt.status === "delivered");
        return {
            artifactRef: `file:${delivery.filePath}`,
            targetRef: delivery.messageId !== undefined
                ? `channel:${delivery.channel}:${String(delivery.messageId)}`
                : `channel:${delivery.channel}`,
            ...(providerReceipt ? { observedAt: new Date(providerReceipt.timestamp).toISOString() } : {}),
            ...(providerReceipt
                ? { receiptRef: `delivery:${providerReceipt.provider}:${providerReceipt.idempotencyKey}` }
                : {}),
        };
    });
    const stateChanges = input.sawRealFilesystemMutation
        ? [{
                stateRef: "state:filesystem:mutation-observed",
                targetRef: "filesystem:runtime",
                status: "observed",
            }]
        : [];
    const deliveryCanBeReviewed = input.deliveryOutcome?.deliverySatisfied === true ||
        input.deliveryOutcome?.directArtifactDeliveryRequested === true;
    const deliveries = input.deliveryOutcome && deliveryCanBeReviewed
        ? [{
                deliveryRef: `delivery-outcome:${input.deliveryOutcome.mode ?? "unspecified"}`,
                targetRef: `delivery-mode:${input.deliveryOutcome.mode ?? "unspecified"}`,
                status: input.deliveryOutcome.deliverySatisfied ? "satisfied" : "unsatisfied",
            }]
        : [];
    return { artifacts, stateChanges, deliveries };
}
function reviewPassErrorUserMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(sanitizeUserFacingError(raw).userMessage);
}
function normalizePreDeliveryOrdinaryReplyReview(input) {
    const assessments = input.review.criterionAssessments;
    const deliveryAssessment = assessments?.find((assessment) => assessment.criterionKey === "delivery");
    const semanticCriteriaSatisfied = assessments !== undefined &&
        assessments.every((assessment) => assessment.criterionKey === "delivery" ||
            !assessment.applicable ||
            assessment.verdict === "satisfied");
    const conditionsSatisfied = input.review.conditionAssessments?.every((assessment) => assessment.verdict === "satisfied") ?? true;
    const ordinaryReplyAwaitingFinalizer = input.deliveryOutcome?.mode === "reply" &&
        input.deliveryOutcome.directArtifactDeliveryRequested === false &&
        input.deliveryOutcome.deliverySatisfied === false;
    if (input.review.status !== "followup" ||
        input.review.followupExecutionMode !== "response_only" ||
        !input.preview.trim() ||
        !ordinaryReplyAwaitingFinalizer ||
        !semanticCriteriaSatisfied ||
        !conditionsSatisfied ||
        !deliveryAssessment?.applicable ||
        deliveryAssessment.verdict === "satisfied") {
        return input.review;
    }
    const { followupPrompt: _followupPrompt, followupExecutionMode: _followupExecutionMode, followupRequiredToolNames: _followupRequiredToolNames, followupTargetRefs: _followupTargetRefs, ...reviewWithoutFollowup } = input.review;
    return {
        ...reviewWithoutFollowup,
        status: "complete",
        followupEvidenceRefs: [],
        remainingItems: [],
        criterionAssessments: assessments.map((assessment) => assessment.criterionKey === "delivery"
            ? {
                ...assessment,
                applicable: false,
                verdict: "satisfied",
                evidenceRefs: [],
                uncertainty: "",
                reason: "Ordinary reply dispatch is owned by the finalizer after review.",
            }
            : assessment),
    };
}
export async function runReviewPass(params, dependencies) {
    const operationalEvidence = params.operationalEvidence ?? buildCompletionReviewOperationalEvidence({
        successfulFileDeliveries: params.successfulFileDeliveries,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        ...(params.deliveryOutcome ? { deliveryOutcome: params.deliveryOutcome } : {}),
    });
    let review = null;
    let reviewFailureReasonCode;
    let finalProviderError;
    for (let providerAttempt = 1; providerAttempt <= 3; providerAttempt += 1) {
        try {
            review = await dependencies.reviewTaskCompletion({
                instructionRuntime: params.instructionRuntime,
                ...(params.runId ? { runId: params.runId } : {}),
                ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
                ...(params.sessionId ? { sessionId: params.sessionId } : {}),
                originalRequest: params.originalRequest,
                latestAssistantMessage: params.preview,
                priorAssistantMessages: params.priorAssistantMessages,
                ...(params.model ? { model: params.model } : {}),
                ...(params.providerId ? { providerId: params.providerId } : {}),
                ...(params.provider ? { provider: params.provider } : {}),
                config: params.config,
                ...(params.workDir ? { workDir: params.workDir } : {}),
                successfulTools: params.successfulTools,
                ...(params.requiresSuccessfulToolEvidence
                    ? { requiresSuccessfulToolEvidence: true }
                    : {}),
                operationalEvidence,
                completionConditions: params.completionConditions,
                ...(params.seenFollowupTransitionKeys
                    ? { seenFollowupTransitionKeys: params.seenFollowupTransitionKeys }
                    : {}),
                ...(dependencies.onReviewRejected ? { onRejected: dependencies.onReviewRejected } : {}),
            });
            break;
        }
        catch (error) {
            finalProviderError = error;
        }
    }
    if (!review) {
        if (finalProviderError !== undefined) {
            dependencies.onReviewError?.(reviewPassErrorUserMessage(finalProviderError));
            reviewFailureReasonCode = "completion_review_provider_failed";
        }
        else {
            reviewFailureReasonCode = "completion_review_contract_invalid";
        }
    }
    else {
        review = normalizePreDeliveryOrdinaryReplyReview({
            review,
            preview: params.preview,
            ...(params.deliveryOutcome ? { deliveryOutcome: params.deliveryOutcome } : {}),
        });
    }
    const syntheticApproval = detectSyntheticApprovalRequest({
        executionProfile: params.executionProfile,
        originalRequest: params.originalRequest,
        preview: params.preview,
        review,
        usesWorkerRuntime: params.usesWorkerRuntime,
        requiresPrivilegedToolExecution: params.requiresPrivilegedToolExecution,
        successfulTools: params.successfulTools,
        successfulFileDeliveries: params.successfulFileDeliveries,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
    });
    return {
        review,
        ...(reviewFailureReasonCode ? { reviewFailureReasonCode } : {}),
        syntheticApproval,
    };
}
export const defaultReviewPassDependencies = {
    reviewTaskCompletion,
};
//# sourceMappingURL=review-pass.js.map