import { buildImplicitExecutionSummary } from "./execution.js";
import { deriveCompletionStageState } from "./completion-state.js";
import { shouldRetryTruncatedOutput } from "./recovery.js";
function summarizeBlockingReasons(reasons, fallback) {
    const uniqueReasons = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
    return uniqueReasons.length > 0 ? uniqueReasons.join(" ") : fallback;
}
export function decideCompletionFlow(params) {
    const completionState = deriveCompletionStageState({
        review: params.review,
        executionSemantics: params.executionSemantics,
        preview: params.preview,
        deliverySatisfied: params.deliverySatisfied,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
        truncatedOutputRecoveryAttempted: params.truncatedOutputRecoveryAttempted,
    });
    if (params.reviewFailureReasonCode) {
        return {
            kind: "blocked",
            summary: "기존 실행 결과를 보존하고 결과 검토 단계에서 종료합니다.",
            reason: params.reviewFailureReasonCode === "completion_review_provider_failed"
                ? "결과 검토 LLM 응답을 받을 수 없어 같은 도구 실행을 반복하지 않았습니다."
                : "결과 검토 응답 계약을 복구하지 못해 같은 도구 실행을 반복하지 않았습니다.",
            remainingItems: ["보존된 실행 근거에 대한 LLM 결과 검토"],
        };
    }
    if (!params.review && !completionState.completionSatisfied) {
        return {
            kind: "recover_empty_result",
            summary: "실행 결과가 비어 있어 다른 방법으로 다시 시도합니다.",
            reason: summarizeBlockingReasons(completionState.blockingReasons, "체크리스트 기준으로 완료 항목이 아직 모두 충족되지 않았습니다."),
            remainingItems: ["실제 실행 결과를 남기거나 다른 방법으로 다시 시도해야 합니다."],
        };
    }
    if (params.review?.status === "complete" && !completionState.completionSatisfied) {
        return {
            kind: "recover_empty_result",
            summary: "완료 판정 근거가 부족해 다시 확인합니다.",
            reason: `completion review가 complete를 반환했지만 checklist 기준으로는 아직 완료 항목이 남아 있습니다: ${summarizeBlockingReasons(completionState.blockingReasons, "완료 근거가 부족합니다.")}`,
            remainingItems: ["실제 실행 또는 전달 근거를 다시 확인해야 합니다."],
        };
    }
    if ((!params.review || params.review.status === "complete") && completionState.completionSatisfied) {
        const summary = params.review?.summary?.trim()
            || params.preview
            || buildImplicitExecutionSummary({
                successfulTools: params.successfulTools,
                sawRealFilesystemMutation: params.sawRealFilesystemMutation,
            })
            || "실행을 완료했습니다.";
        return {
            kind: "complete",
            summary,
            persistedText: params.preview || summary,
            statusText: params.preview || "실행을 완료했습니다.",
        };
    }
    const review = params.review;
    if (!review) {
        return {
            kind: "recover_empty_result",
            summary: "완료 판단 근거가 부족해 다시 시도합니다.",
            reason: summarizeBlockingReasons(completionState.blockingReasons, "completion review 결과가 없고 checklist 기준 완료 항목도 아직 남아 있습니다."),
            remainingItems: ["실제 실행 또는 전달 근거를 다시 확인해야 합니다."],
        };
    }
    if (review.status === "followup") {
        const followupPrompt = review.followupPrompt?.trim();
        if (!followupPrompt) {
            return {
                kind: "invalid_followup",
                summary: review.summary || "추가 작업이 남아 있지만 후속 지시가 비어 있습니다.",
                reason: review.reason || "후속 처리 지시 생성 실패",
                remainingItems: review.remainingItems,
            };
        }
        return {
            kind: "followup",
            summary: review.summary || "추가 처리가 필요합니다.",
            reason: review.reason,
            remainingItems: review.remainingItems,
            followupPrompt,
            followupEvidenceRefs: review.followupEvidenceRefs,
            evidenceRevisionRefs: review.contextReceipt?.evidenceRefs ?? review.followupEvidenceRefs,
            ...(review.followupExecutionMode
                ? { followupExecutionMode: review.followupExecutionMode }
                : {}),
            ...(review.followupRequiredToolNames?.length
                ? { followupRequiredToolNames: review.followupRequiredToolNames }
                : {}),
            ...(review.followupTargetRefs?.length
                ? { followupTargetRefs: review.followupTargetRefs }
                : {}),
        };
    }
    if (review.status === "blocked" || review.status === "paths_exhausted") {
        return {
            kind: "blocked",
            summary: review.summary || "확인 가능한 범위까지 처리했습니다.",
            reason: review.reason || "사용 가능한 증거로는 요청을 완전히 검증할 수 없습니다.",
            remainingItems: review.remainingItems,
        };
    }
    if (shouldRetryTruncatedOutput({
        review,
        preview: params.preview,
        requiresFilesystemMutation: params.requiresFilesystemMutation,
    }) && !params.truncatedOutputRecoveryAttempted) {
        return {
            kind: "retry_truncated",
            summary: review.summary || "중간에 끊긴 작업을 다른 방식으로 이어갑니다.",
            ...(review.reason ? { reason: review.reason } : {}),
            ...(review.remainingItems.length > 0 ? { remainingItems: review.remainingItems } : {}),
        };
    }
    if (!review.inputRequirement) {
        return {
            kind: "blocked",
            summary: "추가 사용자 입력 계약을 검증하지 못했습니다.",
            reason: "completion review ask_user 결과에 typed input requirement가 없습니다.",
            remainingItems: review.remainingItems,
        };
    }
    return {
        kind: "ask_user",
        summary: review.summary || "사용자 추가 입력이 필요합니다.",
        ...(review.reason ? { reason: review.reason } : {}),
        ...(review.remainingItems.length > 0 ? { remainingItems: review.remainingItems } : {}),
        ...(review.userMessage ? { userMessage: review.userMessage } : {}),
        inputRequirement: review.inputRequirement,
    };
}
//# sourceMappingURL=completion-flow.js.map