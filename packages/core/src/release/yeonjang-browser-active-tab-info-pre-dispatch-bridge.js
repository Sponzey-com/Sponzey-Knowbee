import { validateYeonjangBrowserActiveTabInfoEvidenceUse } from "./yeonjang-browser-active-tab-info-audit-evidence-boundary.js";
const REQUIRED_GATES = [
    "ready_target",
    "approval_receipt",
    "backend_criteria",
    "rust_inventory_contract",
    "redacted_projection",
];
const DEFAULT_APPROVAL_MAX_AGE_MS = 10 * 60 * 1000;
export function buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan(input) {
    if (!input.readyTarget)
        return blocked("active_tab_info_ready_target_required");
    const admission = evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
        readyTarget: input.readyTarget,
        approvalReceipt: input.approvalReceipt,
        now: input.now,
        maxAgeMs: input.approvalMaxAgeMs,
    });
    if (admission.status !== "approved")
        return blocked("active_tab_info_approval_required");
    if (!isValidCriteria(input.criteria))
        return blocked("active_tab_info_backend_criteria_required");
    if (!isValidRustInventory(input.rustInventory)) {
        return blocked("active_tab_info_rust_inventory_contract_required");
    }
    if (!input.redactedProjection)
        return blocked("active_tab_info_redacted_projection_required");
    const redactedProjectionValidation = validateYeonjangBrowserActiveTabInfoEvidenceUse({
        destination: "pre_dispatch_preview",
        visibility: "redacted",
        explicitAuditContext: false,
        fields: Object.keys(input.redactedProjection),
    });
    if (!redactedProjectionValidation.ok)
        return blocked("active_tab_info_redacted_projection_required");
    return {
        status: "prepared",
        reasonCode: "active_tab_info_pre_dispatch_prepared",
        method: "browser.active_tab_info",
        toolName: "yeonjang_browser_active_tab_info",
        target: {
            publicTargetName: input.readyTarget.publicTargetName,
            platform: input.readyTarget.platform,
        },
        observation: {
            schemaVersion: input.redactedProjection.schemaVersion,
            observationStatus: input.redactedProjection.observationStatus,
            browserName: input.redactedProjection.browserName,
            ...(input.redactedProjection.titleHash
                ? { titleHash: input.redactedProjection.titleHash, titleLength: input.redactedProjection.titleLength }
                : {}),
            ...(input.redactedProjection.urlHash
                ? {
                    urlScheme: input.redactedProjection.urlScheme,
                    urlHash: input.redactedProjection.urlHash,
                    urlLength: input.redactedProjection.urlLength,
                }
                : {}),
        },
        requiredGates: [...REQUIRED_GATES],
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
    };
}
export function evaluateYeonjangBrowserActiveTabInfoAdmissionGate(input) {
    const receipt = input.approvalReceipt;
    if (!isStructurallyValidApprovalReceipt(receipt)) {
        return admissionBlocked("missing_receipt", "active_tab_info_approval_receipt_missing");
    }
    if (receipt.approvalScope === "deny") {
        return admissionBlocked("denied", "active_tab_info_approval_denied", receipt.publicTargetName);
    }
    if (!input.readyTarget || receipt.publicTargetName !== input.readyTarget.publicTargetName) {
        return admissionBlocked("target_mismatch", "active_tab_info_approval_target_mismatch", receipt.publicTargetName);
    }
    if (isApprovalExpired(receipt, input.now, input.maxAgeMs)) {
        return admissionBlocked("expired", "active_tab_info_approval_expired", receipt.publicTargetName);
    }
    return {
        status: "approved",
        reasonCode: "active_tab_info_approval_admitted",
        method: "browser.active_tab_info",
        publicTargetName: receipt.publicTargetName,
        approvalScope: receipt.approvalScope,
        invokeNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoAdmissionGateProjection(gate) {
    return {
        status: gate.status,
        reasonLabel: admissionReasonLabel(gate.status),
        nextActionLabel: admissionNextActionLabel(gate.status),
        method: "browser.active_tab_info",
        ...(gate.publicTargetName ? { publicTargetName: gate.publicTargetName } : {}),
    };
}
function blocked(reasonCode) {
    return {
        status: "blocked",
        reasonCode,
        method: "browser.active_tab_info",
        toolName: "yeonjang_browser_active_tab_info",
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
    };
}
function isValidCriteria(criteria) {
    return criteria?.method === "browser.active_tab_info" && criteria.addRustDispatchNow === false;
}
function isValidRustInventory(inventory) {
    return inventory?.method === "browser.active_tab_info" && inventory.addRustDispatchNow === false;
}
function admissionBlocked(status, reasonCode, publicTargetName) {
    return {
        status,
        reasonCode,
        method: "browser.active_tab_info",
        ...(publicTargetName ? { publicTargetName } : {}),
        invokeNow: false,
    };
}
function isStructurallyValidApprovalReceipt(receipt) {
    return Boolean(receipt &&
        receipt.method === "browser.active_tab_info" &&
        typeof receipt.publicTargetName === "string" &&
        receipt.publicTargetName.trim() &&
        (receipt.approvalScope === "allow_once" ||
            receipt.approvalScope === "allow_for_session" ||
            receipt.approvalScope === "deny") &&
        typeof receipt.approvedAt === "string" &&
        Number.isFinite(Date.parse(receipt.approvedAt)) &&
        typeof receipt.nonce === "string" &&
        receipt.nonce.trim());
}
function isApprovalExpired(receipt, nowInput, maxAgeMsInput) {
    const maxAgeMs = Number.isFinite(maxAgeMsInput) && maxAgeMsInput !== undefined
        ? Math.max(0, maxAgeMsInput)
        : DEFAULT_APPROVAL_MAX_AGE_MS;
    const approvedAt = Date.parse(receipt.approvedAt);
    const now = nowInput === undefined ? Date.now() : new Date(nowInput).getTime();
    if (!Number.isFinite(approvedAt) || !Number.isFinite(now))
        return true;
    return now - approvedAt > maxAgeMs;
}
function admissionReasonLabel(status) {
    switch (status) {
        case "approved":
            return "Active tab read approval is ready.";
        case "denied":
            return "Active tab read approval was denied.";
        case "expired":
            return "Active tab read approval expired.";
        case "target_mismatch":
            return "Active tab read approval target does not match.";
        case "missing_receipt":
            return "Active tab read approval is required.";
    }
}
function admissionNextActionLabel(status) {
    switch (status) {
        case "approved":
            return "Continue with pre-dispatch checks.";
        case "denied":
            return "Ask the user before trying again.";
        case "expired":
            return "Request a fresh active tab read approval.";
        case "target_mismatch":
            return "Confirm the target and request approval again.";
        case "missing_receipt":
            return "Request explicit user approval first.";
    }
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-pre-dispatch-bridge.js.map