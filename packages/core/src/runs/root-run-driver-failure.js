import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { buildCanonicalResultReportFacts, } from "../contracts/canonical-result-report.js";
import { redactLogText } from "../logger/index.js";
import { isCanonicalExecutionFailure } from "./canonical-execution-failure.js";
import { sanitizeUserFacingError, } from "./error-sanitizer.js";
import { applyFatalFailure } from "./failure-application.js";
import { completeRunWithAssistantMessage, } from "./finalization.js";
const defaultModuleDependencies = {
    applyFatalFailure,
    completeRunWithAssistantMessage,
};
function failureMessage(failure) {
    return redactLogText(failure instanceof Error ? failure.message : String(failure));
}
function canonicalFailureSummary(failure) {
    if (!failure)
        throw new Error("Canonical failure is required.");
    switch (failure.reasonCode) {
        case "provider_unavailable":
        case "transport_failed":
            return {
                kind: "network",
                userMessage: "요청 분석용 AI provider가 응답하지 않아 실행을 시작하지 못했습니다.",
                reason: `요청 분석 단계가 실행 전에 중단되었습니다. reason_code=${failure.reasonCode}`,
                actionHint: "연결된 AI provider 상태를 확인한 뒤 같은 요청을 다시 시도하세요.",
            };
        case "deadline_exceeded":
            return {
                kind: "timeout",
                userMessage: "요청 분석용 AI provider가 제한 시간 안에 응답하지 않았습니다.",
                reason: "요청 분석 단계가 실행 전에 시간 초과되었습니다. reason_code=deadline_exceeded",
                actionHint: "연결된 AI provider 응답 상태를 확인한 뒤 다시 시도하세요.",
            };
        case "provider_contract_rejected":
        case "response_invalid":
            return {
                kind: "schema",
                userMessage: "요청 분석용 AI 응답이 필요한 계약을 충족하지 못했습니다.",
                reason: `요청 분석 단계가 실행 전에 중단되었습니다. reason_code=${failure.reasonCode}`,
                actionHint: "AI provider와 structured response 계약의 호환 상태를 확인하세요.",
            };
        case "solution_plan_selected_capability_unavailable":
            return {
                kind: "tool_failure",
                userMessage: "선택한 실행 기능을 현재 연결된 연장에서 사용할 수 없어 실행하지 못했습니다.",
                reason: "계획에 선택된 실행 기능이 현재 연장 capability 목록에서 실행 가능 상태가 아닙니다. "
                    + "reason_code=solution_plan_selected_capability_unavailable",
                actionHint: "시스템이 연장 연결과 기능 목록을 갱신한 뒤 다른 실행 전략으로 다시 계획해야 합니다.",
            };
        default:
            return {
                kind: "schema",
                userMessage: "내부 실행 계약 검증을 통과하지 못했습니다.",
                reason: "실행 결과 또는 상태 전이 receipt가 canonical 계약과 일치하지 않습니다.",
                actionHint: "audit의 canonical 실패 정보를 확인하고 계약 입력과 receipt 연결을 수정하세요.",
            };
    }
}
function canonicalFailureOrUndefined(failure) {
    return isCanonicalExecutionFailure(failure) ? failure : undefined;
}
function canonicalFailureReportLanguage(responseContext) {
    const configured = responseContext.identityContext?.promptLocale;
    if (configured)
        return configured;
    return detectPrimaryMessageLanguage(responseContext.originalRequest) === "ko" ? "ko" : "en";
}
function canonicalFailureTerminalReport(input) {
    const primaryLanguage = canonicalFailureReportLanguage(input.responseContext);
    const intakeFailure = input.failure.phase === "intake";
    const unresolvedScope = primaryLanguage === "ko"
        ? intakeFailure
            ? "요청 분석 및 후속 실행"
            : "요청 처리 및 결과 검증"
        : intakeFailure
            ? "Request analysis and subsequent execution"
            : "Request processing and result verification";
    const verifiedReason = primaryLanguage === "ko"
        ? intakeFailure
            ? "요청 분석 단계가 실행 전에 중단되어 도구 또는 장치 실행이 관측되지 않았습니다."
            : input.summary.reason
        : intakeFailure
            ? "Request analysis stopped before execution, so no tool or device execution was observed."
            : input.summary.reason;
    const nextAction = primaryLanguage === "ko"
        ? (input.summary.actionHint
            ?? "확인된 실패 조건을 해결한 뒤 같은 요청을 다시 시도하세요.")
        : input.failure.retryable
            ? "Resolve the reported provider or contract condition, then retry the same request."
            : "Review the reported contract condition before submitting the request again.";
    return buildCanonicalResultReportFacts({
        goalId: `goal:root:${input.runId}`,
        workId: canonicalWorkIdForRootRun(input.runId),
        outcome: "blocked",
        primaryLanguage,
        completedScope: [],
        unresolvedScope: [unresolvedScope],
        reasonCode: input.failure.reasonCode,
        verifiedReasonFacts: [verifiedReason],
        evidenceRefs: [...input.failure.safeEvidenceRefs],
        nextActions: [{ kind: "required_condition", text: nextAction }],
    });
}
export async function applyRootRunDriverFailure(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const canonicalFailure = canonicalFailureOrUndefined(params.failure);
    const message = canonicalFailure
        ? "Canonical execution contract validation failed."
        : failureMessage(params.failure);
    const sanitized = canonicalFailure
        ? canonicalFailureSummary(canonicalFailure)
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
                `runtime_failure_kind:${sanitized.kind}`,
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
        const terminalReport = canonicalFailure
            ? canonicalFailureTerminalReport({
                runId: params.runId,
                responseContext: params.responseContext,
                failure: canonicalFailure,
                summary: sanitized,
            })
            : undefined;
        const responseContext = canonicalFailure?.phase === "intake"
            ? {
                ...params.responseContext,
                failureEvidence: {
                    schemaVersion: 1,
                    phase: canonicalFailure.phase,
                    reasonCode: canonicalFailure.reasonCode,
                    retryable: canonicalFailure.retryable,
                    executionObserved: false,
                    deliveryObserved: false,
                    evidenceRefs: canonicalFailure.safeEvidenceRefs,
                },
            }
            : params.responseContext;
        const delivery = await moduleDependencies.completeRunWithAssistantMessage({
            runId: params.runId,
            sessionId: params.sessionId,
            text: canonicalFailure
                ? sanitized.userMessage
                : "요청 처리 중 문제가 발생해 현재 결과를 완료하지 못했습니다. "
                    + "가능한 다음 조치를 사용자 요청 언어로 간단히 설명합니다.",
            textSource: "runtime_deterministic",
            responseContext,
            source: params.source,
            onChunk: params.onChunk,
            ...(terminalReport
                ? {
                    canonicalFinalOutcome: "blocked",
                    terminalReport,
                }
                : {}),
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