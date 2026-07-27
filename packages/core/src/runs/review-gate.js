import { deriveCompletionStageState } from "./completion-state.js";
export function decideReviewGate(params) {
    const hasWebEvidence = params.successfulTools.some((item) => item.toolName === "web_fetch");
    const state = deriveCompletionStageState({
        review: null,
        executionSemantics: params.executionSemantics,
        preview: params.preview,
        deliverySatisfied: params.deliveryOutcome.deliverySatisfied,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
    });
    if (params.successfulTools.length > 0) {
        return {
            kind: "run",
            state,
            reason: "successful_tool_result_requires_llm_result_diagnosis",
        };
    }
    if (params.deliveryOutcome.directArtifactDeliveryRequested
        && params.deliveryOutcome.deliverySatisfied
        && state.completionSatisfied) {
        return {
            kind: "skip",
            state,
            reason: "직접 결과 전달과 checklist 기준 완료 항목이 이미 모두 충족되어 completion review를 생략합니다.",
        };
    }
    if (!params.deliveryOutcome.directArtifactDeliveryRequested
        && state.completionSatisfied
        && params.deliveryOutcome.hasSuccessfulTextDelivery
        && !hasWebEvidence
        && !params.requiresFilesystemMutation
        && !params.sawRealFilesystemMutation) {
        return {
            kind: "skip",
            state,
            reason: "reply 텍스트 전달 receipt와 checklist 기준 완료 항목이 이미 충족되어 completion review를 생략합니다.",
        };
    }
    return {
        kind: "run",
        state,
    };
}
export function decideSubSessionReviewGate(reviews) {
    const blocked = reviews.filter((item) => !item.review.accepted);
    const limited = reviews.filter((item) => item.review.accepted &&
        (item.review.verdict === "limited_success" ||
            item.review.parentIntegrationStatus === "limited_parent_integration"));
    if (blocked.length === 0) {
        if (limited.length > 0) {
            return {
                kind: "parent_aggregation_required",
                blockedSubSessionIds: [],
                limitedSubSessionIds: limited.map((item) => item.subSessionId),
                reasonCodes: [
                    "limited_success_parent_integration_requires_parent_decision",
                    "parent_aggregation_required",
                ],
            };
        }
        return {
            kind: "allow_parent_completion",
            blockedSubSessionIds: [],
            limitedSubSessionIds: [],
            reasonCodes: ["all_sub_session_results_accepted"],
        };
    }
    const needsManualAction = blocked.some((item) => !item.review.canRetry &&
        (item.review.manualActionReason === "permission_required" ||
            item.review.manualActionReason === "user_decision_required"));
    return {
        kind: needsManualAction
            ? "manual_action_required"
            : blocked.some((item) => item.review.canRetry)
                ? "wait_for_revision"
                : "parent_aggregation_required",
        blockedSubSessionIds: blocked.map((item) => item.subSessionId),
        limitedSubSessionIds: limited.map((item) => item.subSessionId),
        reasonCodes: [...new Set(blocked.map((item) => item.review.manualActionReason
                ?? item.review.normalizedFailureKey
                ?? "sub_session_result_not_accepted"))].sort(),
    };
}
//# sourceMappingURL=review-gate.js.map