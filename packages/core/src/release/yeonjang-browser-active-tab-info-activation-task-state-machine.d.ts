import type { YeonjangBrowserActiveTabInfoActivationRequest } from "./yeonjang-browser-active-tab-info-activation-request.js";
export type YeonjangBrowserActiveTabInfoActivationTaskState = "draft" | "request_validated" | "operator_confirmed" | "execution_planned" | "blocked" | "cancelled";
export type YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode = "activation_task_request_not_ready" | "activation_task_operator_confirmation_required" | "activation_task_rollback_plan_required" | "activation_task_surface_matrix_required";
export interface YeonjangBrowserActiveTabInfoActivationTaskTransitionInput {
    currentState: YeonjangBrowserActiveTabInfoActivationTaskState;
    activationRequest: YeonjangBrowserActiveTabInfoActivationRequest;
    operatorConfirmed: boolean;
    rollbackPlanAccepted: boolean;
    surfaceMatrixAccepted: boolean;
    cancelRequested: boolean;
}
export type YeonjangBrowserActiveTabInfoActivationTaskReasonCode = "active_tab_info_activation_request_validated" | "active_tab_info_activation_operator_confirmed" | "active_tab_info_activation_execution_planned" | "active_tab_info_activation_gate_missing" | "active_tab_info_activation_cancelled";
export type YeonjangBrowserActiveTabInfoActivationTaskTransitionResult = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-task-state.v1";
    method: "browser.active_tab_info";
    state: YeonjangBrowserActiveTabInfoActivationTaskState;
    reasonCode: YeonjangBrowserActiveTabInfoActivationTaskReasonCode;
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoActivationTaskBlockingReasonCode[];
    executeNow: false;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function transitionYeonjangBrowserActiveTabInfoActivationTask(input: YeonjangBrowserActiveTabInfoActivationTaskTransitionInput): YeonjangBrowserActiveTabInfoActivationTaskTransitionResult;
//# sourceMappingURL=yeonjang-browser-active-tab-info-activation-task-state-machine.d.ts.map