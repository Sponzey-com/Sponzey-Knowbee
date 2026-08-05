import { applyExternalRecoveryAttempt, } from "./external-retry-application.js";
import { applyFatalFailure, } from "./failure-application.js";
import { describeWorkerRuntimeErrorReason } from "./recovery.js";
const defaultModuleDependencies = {
    applyExternalRecoveryAttempt,
    applyFatalFailure,
    describeWorkerRuntimeErrorReason,
};
export async function applyErrorChunkPass(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    dependencies.appendRunEvent(params.runId, "user_facing_error_text_source:runtime_deterministic");
    dependencies.appendRunEvent(params.runId, "user_facing_error_delivery_blocked:llm_required");
    if (params.executionRecoveryLimitStop) {
        dependencies.appendRunEvent(params.runId, "실행 복구를 자동으로 계속할 수 없어 중단합니다.");
        return { failed: false };
    }
    if (params.activeWorkerRuntime && !params.aborted) {
        const summary = `${params.activeWorkerRuntime.label} 오류를 분석하고 다른 경로로 재시도합니다.`;
        const reason = moduleDependencies.describeWorkerRuntimeErrorReason(params.chunk.message);
        const workerRuntimeRecoveryAttempt = moduleDependencies.applyExternalRecoveryAttempt({
            kind: "worker_runtime",
            runId: params.runId,
            sessionId: params.sessionId,
            source: params.source,
            recoveryBudgetUsage: params.recoveryBudgetUsage,
            usedTurns: params.usedTurns,
            maxDelegationTurns: params.maxDelegationTurns,
            failureTitle: "worker_runtime_recovery",
            payload: {
                summary,
                reason,
                message: params.chunk.message,
            },
            limitRemainingItems: ["작업 세션 실패 원인을 더 분석해야 하지만 새 안전 대안이나 필요한 결정 정보가 부족합니다."],
        }, dependencies);
        return applyWorkerRuntimeRecoveryAttempt(workerRuntimeRecoveryAttempt);
    }
    const failureState = moduleDependencies.applyFatalFailure({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        message: params.chunk.message,
        aborted: params.aborted,
        summary: "실행 중 오류로 요청이 중단되었습니다.",
        title: "run_error",
        ...(params.activeWorkerRuntime && params.workerSessionId
            ? { extraEvents: [`${params.workerSessionId} 실행 실패`] }
            : {}),
        appendMessageEventOnAbort: true,
        appendExtraEventsOnAbort: true,
    }, dependencies);
    return { failed: failureState === "failed" };
}
function applyWorkerRuntimeRecoveryAttempt(attempt) {
    if (attempt.kind === "stop") {
        return {
            failed: false,
            limitStop: attempt.stop,
        };
    }
    return {
        failed: false,
        workerRuntimeRecovery: attempt.payload,
    };
}
//# sourceMappingURL=error-chunk-pass.js.map