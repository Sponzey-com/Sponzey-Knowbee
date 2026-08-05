import { YEONJANG_BROWSER_FOCUS_CONTRACT, type YeonjangBrowserFocusTargetProjection } from "../capabilities/yeonjang-browser-focus-contract.js";
import type { YeonjangBrowserFocusMacosExecutorReleaseBridge, YeonjangBrowserFocusPublicTargetEvidence } from "./yeonjang-browser-focus-macos-executor-release-bridge.js";
import type { YeonjangBrowserFocusApprovalReceipt, YeonjangBrowserFocusPreDispatchDecision } from "./yeonjang-browser-focus-pre-dispatch-fixture.js";
export interface YeonjangBrowserFocusToolBindingDescriptor {
    toolName: "yeonjang_browser_focus";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    riskLevel: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel;
    requiresApproval: true;
    runtimeHealthMode: "required";
    runtimeMethodIds: readonly [typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method] | readonly string[];
    sideEffectMethodContractBound: boolean;
    requiresPreDispatchFixture: true;
    requiresMacosBridgeVerified: true;
    rawPayloadVisibility: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility;
    targetSchemaVersion: YeonjangBrowserFocusTargetProjection["schemaVersion"];
}
export type YeonjangBrowserFocusToolBindingPlanReasonCode = "browser_focus_tool_binding_plan_ready" | "descriptor_contract_mismatch" | "side_effect_method_contract_not_bound" | "target_identity_required" | "side_effect_authorization_required" | "pre_dispatch_not_ready" | "macos_bridge_not_verified" | "yeonjang_capability_not_ready";
export type YeonjangBrowserFocusToolBindingPlan = {
    schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "binding_plan_ready";
    reasonCode: "browser_focus_tool_binding_plan_ready";
    addProductionBindingNow: false;
    registerSkillCatalogNow: false;
    dispatcherRegistrationNow: false;
    invokeNow: false;
    target: YeonjangBrowserFocusPublicTargetEvidence;
    approvalScopeId: string;
    requiredGates: readonly YeonjangBrowserFocusToolBindingGate[];
} | {
    schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1";
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method;
    toolName: "yeonjang_browser_focus";
    status: "binding_plan_blocked";
    reasonCode: Exclude<YeonjangBrowserFocusToolBindingPlanReasonCode, "browser_focus_tool_binding_plan_ready">;
    addProductionBindingNow: false;
    registerSkillCatalogNow: false;
    dispatcherRegistrationNow: false;
    invokeNow: false;
    blockedBy?: string | undefined;
};
export type YeonjangBrowserFocusToolBindingGate = "tool_descriptor" | "side_effect_method_contract" | "target_projection" | "approval_receipt" | "pre_dispatch_fixture" | "macos_executor_bridge" | "yeonjang_capability_readiness" | "raw_payload_redaction";
export declare function buildYeonjangBrowserFocusToolBindingPlan(input: {
    descriptor?: YeonjangBrowserFocusToolBindingDescriptor | undefined;
    target?: YeonjangBrowserFocusTargetProjection | undefined;
    approvalReceipt?: YeonjangBrowserFocusApprovalReceipt | undefined;
    preDispatch?: YeonjangBrowserFocusPreDispatchDecision | undefined;
    macosBridge?: YeonjangBrowserFocusMacosExecutorReleaseBridge | undefined;
    yeonjangCapabilityReady: boolean;
    auditOnlyDetails?: Record<string, unknown> | undefined;
}): YeonjangBrowserFocusToolBindingPlan;
//# sourceMappingURL=yeonjang-browser-focus-tool-binding-plan.d.ts.map