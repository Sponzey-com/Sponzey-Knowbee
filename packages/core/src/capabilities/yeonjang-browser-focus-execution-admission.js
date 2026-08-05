import { createHash } from "node:crypto";
export function evaluateYeonjangBrowserFocusExecutionAdmission(input) {
    const admission = input.admission;
    if (!admission)
        return blocked("browser_focus_execution_admission_missing");
    if (admission.method !== "browser.focus") {
        return blocked("browser_focus_execution_admission_method_invalid");
    }
    if (admission.targetHash !== input.expectedTargetHash) {
        return blocked("browser_focus_execution_admission_target_mismatch");
    }
    if (admission.extensionId !== input.expectedExtensionId ||
        normalizeOptional(admission.sessionId) !== normalizeOptional(input.expectedSessionId)) {
        return blocked("browser_focus_execution_admission_target_instance_mismatch");
    }
    const expiresAt = Date.parse(admission.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) {
        return blocked("browser_focus_execution_admission_expired");
    }
    if (!input.signatureVerifier.verify({ admission })) {
        return blocked("browser_focus_execution_admission_signature_invalid");
    }
    if (!input.nonceStore.consume({ nonce: admission.nonce, expiresAt: admission.expiresAt })) {
        return blocked("browser_focus_execution_admission_nonce_replayed");
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1",
        method: "browser.focus",
        status: "accepted",
        reasonCode: "browser_focus_execution_admission_accepted",
        executionAdmissionRef: buildExecutionAdmissionRef(admission),
        invokeOsFocusNow: false,
        userGoalSucceededNow: false,
    };
}
function blocked(reasonCode) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1",
        method: "browser.focus",
        status: "blocked",
        reasonCode,
        invokeOsFocusNow: false,
        userGoalSucceededNow: false,
    };
}
function buildExecutionAdmissionRef(admission) {
    const value = [
        admission.extensionId,
        normalizeOptional(admission.sessionId),
        admission.targetHash,
        admission.approvalScopeId,
        admission.expiresAt,
        admission.nonce,
    ].join("\u0000");
    return `yeonjang-browser-focus-execution-admission:sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function normalizeOptional(value) {
    return value?.trim() ?? "";
}
//# sourceMappingURL=yeonjang-browser-focus-execution-admission.js.map