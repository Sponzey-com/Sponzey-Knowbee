import { redactLogText } from "../logger/index.js";
import { isCanonicalExecutionFailure } from "./canonical-execution-failure.js";
import { sanitizeUserFacingError } from "./error-sanitizer.js";
import { applyFatalFailure } from "./failure-application.js";
import { completeRunWithAssistantMessage, } from "./finalization.js";
const defaultModuleDependencies = {
    applyFatalFailure,
    completeRunWithAssistantMessage,
};
function failureMessage(failure) {
    return redactLogText(failure instanceof Error ? failure.message : String(failure));
}
export async function applyRootRunDriverFailure(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const canonicalFailure = isCanonicalExecutionFailure(params.failure) ? params.failure : undefined;
    const message = canonicalFailure
        ? "Canonical execution contract validation failed."
        : failureMessage(params.failure);
    const sanitized = canonicalFailure
        ? {
            kind: "schema",
            userMessage: "내부 실행 계약 검증을 통과하지 못했습니다.",
            reason: "실행 결과 또는 상태 전이 receipt가 canonical 계약과 일치하지 않습니다.",
            actionHint: "audit의 canonical 실패 정보를 확인하고 계약 입력과 receipt 연결을 수정하세요.",
        }
        : sanitizeUserFacingError(message);
    moduleDependencies.applyFatalFailure({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        message,
        aborted: params.aborted,
        summary: "예상하지 못한 실행 오류가 발생했습니다.",
        title: canonicalFailure
            ? `canonical_failure:${canonicalFailure.reasonCode}`
            : `runtime_failure:${sanitized.kind}`,
        extraEvents: canonicalFailure
            ? [
                "runtime_failure_kind:schema",
                `canonical_failure_phase:${canonicalFailure.phase}`,
                `canonical_failure_reason:${canonicalFailure.reasonCode}`,
                `canonical_failure_retryable:${String(canonicalFailure.retryable)}`,
            ]
            : [`runtime_failure_kind:${sanitized.kind}`],
        sanitizedError: sanitized,
    }, {
        appendRunEvent: dependencies.appendRunEvent,
        setRunStepStatus: dependencies.setRunStepStatus,
        updateRunStatus: dependencies.updateRunStatus,
        rememberRunFailure: dependencies.rememberRunFailure,
        markAbortedRunCancelledIfActive: dependencies.markAbortedRunCancelledIfActive,
    });
    dependencies.appendRunEvent(params.runId, "user_facing_error_text_source:runtime_deterministic");
    if (!params.aborted &&
        params.responseContext &&
        dependencies.finalizationDependencies) {
        const delivery = await moduleDependencies.completeRunWithAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: "요청 처리 중 문제가 발생해 현재 결과를 완료하지 못했습니다. "
                + "가능한 다음 조치를 사용자 요청 언어로 간단히 설명합니다.",
            textSource: "runtime_deterministic",
            responseContext: params.responseContext,
            source: params.source,
            onChunk: params.onChunk,
            preserveRunStatusAfterDelivery: true,
            dependencies: dependencies.finalizationDependencies,
        });
        dependencies.appendRunEvent(params.runId, delivery.status === "completed"
            ? "user_facing_error_delivery_completed:llm_reviewed"
            : `user_facing_error_delivery_pending:${delivery.status}`);
        return;
    }
    dependencies.appendRunEvent(params.runId, "user_facing_error_delivery_blocked:llm_required");
}
//# sourceMappingURL=root-run-driver-failure.js.map