import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusTargetProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusMacosExecutorReleaseBridge, YeonjangBrowserFocusPublicTargetEvidence } from "./yeonjang-browser-focus-macos-executor-release-bridge.js";
import type { YeonjangBrowserFocusRegistrationPreconditionDecision } from "./yeonjang-browser-focus-registration-precondition.js";
export type YeonjangBrowserFocusApprovalDecision = "allow_once" | "allow_run" | "deny";
export interface YeonjangBrowserFocusApprovalReceipt {
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    decision: YeonjangBrowserFocusApprovalDecision;
    scopeId: string;
    approved: boolean;
    rawReceiptPayload?: Record<string, unknown> | undefined;
}
export type YeonjangBrowserFocusPreDispatchReasonCode = "browser_focus_dispatch_prepared" | "target_identity_required" | "side_effect_authorization_required" | "readiness_not_ready" | "macos_bridge_not_verified";
export type YeonjangBrowserFocusPreDispatchDecision = {
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "dispatch_prepared";
    reasonCode: "browser_focus_dispatch_prepared";
    invokeNow: false;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
    target: YeonjangBrowserFocusPublicTargetEvidence;
    approvalScopeId: string;
    macosBridgeStatus: "bridge_verified";
} | {
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    platform: "macos";
    status: "dispatch_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusPreDispatchReasonCode, "browser_focus_dispatch_prepared">;
    invokeNow: false;
    addProductionBindingNow: false;
    dispatcherRegistrationNow: false;
    blockedBy?: string | undefined;
};
export declare function prepareYeonjangBrowserFocusPreDispatch(input: {
    target?: YeonjangBrowserFocusTargetProjection | undefined;
    approvalReceipt?: YeonjangBrowserFocusApprovalReceipt | undefined;
    registrationPrecondition: YeonjangBrowserFocusRegistrationPreconditionDecision;
    macosBridge: YeonjangBrowserFocusMacosExecutorReleaseBridge;
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserFocusPreDispatchDecision;
//# sourceMappingURL=yeonjang-browser-focus-pre-dispatch-fixture.d.ts.map