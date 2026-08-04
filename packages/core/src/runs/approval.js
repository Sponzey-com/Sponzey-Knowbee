import { loadPromptTemplate } from "../memory/knowbee-md.js";
export function detectSyntheticApprovalRequest(params) {
    if (!params.preview.trim() && params.review?.status !== "ask_user")
        return null;
    if (params.successfulFileDeliveries.length > 0 || params.sawRealFilesystemMutation) {
        return null;
    }
    if (params.requiresPrivilegedToolExecution) {
        return null;
    }
    const reviewExplicitlyNeedsApproval = params.review?.status === "ask_user";
    const privilegedRequestNeedsApproval = params.executionProfile.approvalRequired;
    if (!reviewExplicitlyNeedsApproval && !privilegedRequestNeedsApproval)
        return null;
    if (!params.usesWorkerRuntime && !params.requiresPrivilegedToolExecution)
        return null;
    const toolName = params.executionProfile.approvalTool || "external_action";
    const summary = params.review?.summary?.trim()
        || defaultSyntheticApprovalSummary(toolName);
    const guidance = params.review?.userMessage?.trim()
        || extractSyntheticApprovalGuidance(params.preview);
    return {
        toolName,
        summary,
        ...(guidance ? { guidance } : {}),
        continuationPrompt: buildSyntheticApprovalContinuationPrompt({
            originalRequest: params.originalRequest,
            preview: params.preview,
            toolName,
        }),
    };
}
export function describeSyntheticApprovalDenial(toolName, reason) {
    if (reason === "timeout") {
        return {
            eventLabel: `${toolName} 승인 시간 초과`,
            stepSummary: `${toolName} 승인 대기 시간이 지나 시스템이 요청을 중단했습니다.`,
            runSummary: `${toolName} 승인 시간이 지나 시스템이 요청을 중단했습니다.`,
        };
    }
    if (reason === "system" || reason === "abort") {
        return {
            eventLabel: `${toolName} 승인 처리 중단`,
            stepSummary: `${toolName} 승인 처리가 시스템에 의해 중단되었습니다.`,
            runSummary: `${toolName} 승인 처리가 시스템에 의해 중단되었습니다.`,
        };
    }
    return {
        eventLabel: `${toolName} 실행 거부`,
        stepSummary: `${toolName} 실행이 거부되어 요청을 취소했습니다.`,
        runSummary: `${toolName} 실행이 거부되어 요청을 취소했습니다.`,
    };
}
export async function requestSyntheticApproval(params, dependencies) {
    if (params.signal.aborted) {
        const denial = describeSyntheticApprovalDenial(params.toolName, "abort");
        dependencies.setRunStepStatus(params.runId, "awaiting_approval", "cancelled", denial.stepSummary);
        dependencies.cancelRun(params.runId, denial);
        dependencies.emitApprovalResolved({
            runId: params.runId,
            decision: "deny",
            toolName: params.toolName,
            reason: "abort",
        });
        return "deny";
    }
    dependencies.appendRunEvent(params.runId, `${params.toolName} 승인 요청`);
    dependencies.setRunStepStatus(params.runId, "reviewing", "completed", params.summary);
    dependencies.setRunStepStatus(params.runId, "awaiting_approval", "running", params.summary);
    dependencies.updateRunStatus(params.runId, "awaiting_approval", params.summary, true);
    dependencies.onRequested?.({
        runId: params.runId,
        sessionId: params.sessionId,
        toolName: params.toolName,
    });
    return new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (resolved)
                return;
            resolved = true;
            const denial = describeSyntheticApprovalDenial(params.toolName, "timeout");
            dependencies.setRunStepStatus(params.runId, "awaiting_approval", "cancelled", denial.stepSummary);
            if (dependencies.fallback === "deny") {
                dependencies.cancelRun(params.runId, denial);
            }
            else {
                dependencies.setRunStepStatus(params.runId, "executing", "running", `${params.toolName} 실행을 계속합니다.`);
                dependencies.updateRunStatus(params.runId, "running", `${params.toolName} 실행을 계속합니다.`, true);
            }
            dependencies.emitApprovalResolved({
                runId: params.runId,
                decision: dependencies.fallback,
                toolName: params.toolName,
                reason: "timeout",
            });
            resolve(dependencies.fallback);
        }, Math.max(5, dependencies.timeoutSec) * 1000);
        params.signal.addEventListener("abort", () => {
            if (resolved)
                return;
            resolved = true;
            clearTimeout(timeout);
            const denial = describeSyntheticApprovalDenial(params.toolName, "abort");
            dependencies.setRunStepStatus(params.runId, "awaiting_approval", "cancelled", denial.stepSummary);
            dependencies.cancelRun(params.runId, denial);
            dependencies.emitApprovalResolved({
                runId: params.runId,
                decision: "deny",
                toolName: params.toolName,
                reason: "abort",
            });
            resolve("deny");
        }, { once: true });
        dependencies.emitApprovalRequest({
            runId: params.runId,
            toolName: params.toolName,
            params: params.params,
            kind: "approval",
            ...(params.guidance ? { guidance: params.guidance } : {}),
            resolve: (decision, reason = "user") => {
                if (resolved)
                    return;
                resolved = true;
                clearTimeout(timeout);
                if (decision === "deny") {
                    const denial = describeSyntheticApprovalDenial(params.toolName, reason);
                    dependencies.setRunStepStatus(params.runId, "awaiting_approval", "cancelled", denial.stepSummary);
                    dependencies.cancelRun(params.runId, denial);
                }
                else {
                    dependencies.setRunStepStatus(params.runId, "awaiting_approval", "completed", decision === "allow_run"
                        ? `${params.toolName} 실행을 이 요청 전체에 대해 허용했습니다.`
                        : `${params.toolName} 실행을 이번 단계에 대해 허용했습니다.`);
                }
                resolve(decision);
            },
        });
    });
}
function buildSyntheticApprovalContinuationPrompt(params) {
    return loadPromptTemplate({
        sourceId: "approval_granted_continuation_user",
        variables: {
            originalRequest: params.originalRequest,
            approvalPreview: params.preview,
            toolName: params.toolName,
        },
    });
}
function extractSyntheticApprovalGuidance(preview) {
    const trimmed = preview.trim();
    if (!trimmed)
        return undefined;
    return trimmed.length > 600 ? `${trimmed.slice(0, 599)}…` : trimmed;
}
function defaultSyntheticApprovalSummary(toolName) {
    switch (toolName) {
        case "screen_capture":
            return "화면 캡처 진행 전 승인이 필요합니다.";
        case "yeonjang_camera_capture":
            return "카메라 촬영 진행 전 승인이 필요합니다.";
        case "mouse_click":
            return "마우스 제어 진행 전 승인이 필요합니다.";
        case "keyboard_type":
            return "키보드 제어 진행 전 승인이 필요합니다.";
        case "app_launch":
            return "프로그램 실행 전 승인이 필요합니다.";
        case "file_write":
            return "파일 작업 진행 전 승인이 필요합니다.";
        default:
            return "로컬 작업 진행 전 사용자 승인이 필요합니다.";
    }
}
//# sourceMappingURL=approval.js.map