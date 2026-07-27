import type { YeonjangBrowserActiveTabInfoObservation, YeonjangBrowserActiveTabInfoReadyTarget } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import type { YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria } from "./yeonjang-browser-active-tab-info-backend-acceptance-criteria.js";
import type { YeonjangBrowserActiveTabInfoRustInventoryContract } from "./yeonjang-browser-active-tab-info-rust-inventory-contract.js";
export interface YeonjangBrowserActiveTabInfoApprovalReceipt {
    method: "browser.active_tab_info";
    publicTargetName: string;
    approvalScope: "allow_once" | "allow_for_session" | "deny";
    approvedAt: string;
    nonce: string;
}
export type YeonjangBrowserActiveTabInfoAdmissionGateStatus = "approved" | "denied" | "expired" | "target_mismatch" | "missing_receipt";
export type YeonjangBrowserActiveTabInfoAdmissionGateReasonCode = "active_tab_info_approval_admitted" | "active_tab_info_approval_denied" | "active_tab_info_approval_expired" | "active_tab_info_approval_target_mismatch" | "active_tab_info_approval_receipt_missing";
export type YeonjangBrowserActiveTabInfoAdmissionGateResult = {
    status: "approved";
    reasonCode: "active_tab_info_approval_admitted";
    method: "browser.active_tab_info";
    publicTargetName: string;
    approvalScope: Exclude<YeonjangBrowserActiveTabInfoApprovalReceipt["approvalScope"], "deny">;
    invokeNow: false;
} | {
    status: Exclude<YeonjangBrowserActiveTabInfoAdmissionGateStatus, "approved">;
    reasonCode: Exclude<YeonjangBrowserActiveTabInfoAdmissionGateReasonCode, "active_tab_info_approval_admitted">;
    method: "browser.active_tab_info";
    publicTargetName?: string | undefined;
    invokeNow: false;
};
export interface YeonjangBrowserActiveTabInfoAdmissionGateProjection {
    status: YeonjangBrowserActiveTabInfoAdmissionGateStatus;
    reasonLabel: string;
    nextActionLabel: string;
    method: "browser.active_tab_info";
    publicTargetName?: string | undefined;
}
export type YeonjangBrowserActiveTabInfoPreDispatchGate = "ready_target" | "approval_receipt" | "backend_criteria" | "rust_inventory_contract" | "redacted_projection";
export type YeonjangBrowserActiveTabInfoPreDispatchReasonCode = "active_tab_info_ready_target_required" | "active_tab_info_approval_required" | "active_tab_info_backend_criteria_required" | "active_tab_info_rust_inventory_contract_required" | "active_tab_info_redacted_projection_required" | "active_tab_info_pre_dispatch_prepared";
export type YeonjangBrowserActiveTabInfoPreDispatchBridgePlan = {
    status: "blocked";
    reasonCode: Exclude<YeonjangBrowserActiveTabInfoPreDispatchReasonCode, "active_tab_info_pre_dispatch_prepared">;
    method: "browser.active_tab_info";
    toolName: "yeonjang_browser_active_tab_info";
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
} | {
    status: "prepared";
    reasonCode: "active_tab_info_pre_dispatch_prepared";
    method: "browser.active_tab_info";
    toolName: "yeonjang_browser_active_tab_info";
    target: {
        publicTargetName: string;
        platform: YeonjangBrowserActiveTabInfoReadyTarget["platform"];
    };
    observation: {
        schemaVersion: YeonjangBrowserActiveTabInfoObservation["schemaVersion"];
        observationStatus: YeonjangBrowserActiveTabInfoObservation["observationStatus"];
        browserName: string;
        titleHash?: string | undefined;
        titleLength?: number | undefined;
        urlScheme?: string | undefined;
        urlHash?: string | undefined;
        urlLength?: number | undefined;
    };
    requiredGates: YeonjangBrowserActiveTabInfoPreDispatchGate[];
    invokeNow: false;
    addRustDispatchNow: false;
    addProductionBindingNow: false;
};
export declare function buildYeonjangBrowserActiveTabInfoPreDispatchBridgePlan(input: {
    readyTarget?: YeonjangBrowserActiveTabInfoReadyTarget | undefined;
    approvalReceipt?: YeonjangBrowserActiveTabInfoApprovalReceipt | undefined;
    criteria?: YeonjangBrowserActiveTabInfoBackendAcceptanceCriteria | undefined;
    rustInventory?: YeonjangBrowserActiveTabInfoRustInventoryContract | undefined;
    redactedProjection?: YeonjangBrowserActiveTabInfoObservation | undefined;
    now?: string | Date | number | undefined;
    approvalMaxAgeMs?: number | undefined;
}): YeonjangBrowserActiveTabInfoPreDispatchBridgePlan;
export declare function evaluateYeonjangBrowserActiveTabInfoAdmissionGate(input: {
    readyTarget?: YeonjangBrowserActiveTabInfoReadyTarget | undefined;
    approvalReceipt?: YeonjangBrowserActiveTabInfoApprovalReceipt | undefined;
    now?: string | Date | number | undefined;
    maxAgeMs?: number | undefined;
}): YeonjangBrowserActiveTabInfoAdmissionGateResult;
export declare function buildYeonjangBrowserActiveTabInfoAdmissionGateProjection(gate: YeonjangBrowserActiveTabInfoAdmissionGateResult): YeonjangBrowserActiveTabInfoAdmissionGateProjection;
//# sourceMappingURL=yeonjang-browser-active-tab-info-pre-dispatch-bridge.d.ts.map