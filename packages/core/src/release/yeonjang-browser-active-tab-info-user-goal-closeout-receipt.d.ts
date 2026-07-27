import type { YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate } from "./yeonjang-browser-active-tab-info-final-response-delivery-gate.js";
import type { YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus } from "./yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.js";
export type YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode = "user_goal_closeout_final_response_delivery_gate_not_ready" | "user_goal_closeout_satisfaction_decision_not_satisfied" | "user_goal_closeout_acknowledgement_ref_invalid" | "user_goal_closeout_product_log_evidence_ref_invalid";
export interface YeonjangBrowserActiveTabInfoUserGoalCloseoutReceiptInput {
    finalResponseDeliveryGate: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate;
    userVisibleFinalResponseAcknowledgementRef: string;
    llmResultSatisfactionDecision: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus;
    productLogEvidenceRef: string;
}
export type YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-user-goal-closeout-receipt.v1";
    method: "browser.active_tab_info";
    status: "user_goal_closeout_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_user_goal_closeout_receipt_ready" | "active_tab_info_user_goal_closeout_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode[];
    receipt?: Readonly<{
        userGoalCloseoutReceiptId: string;
        finalDeliveryGateId: string;
        llmSatisfactionDecisionStatus: "satisfied";
        userVisibleFinalResponseAcknowledgementRef: string;
        productLogEvidenceRef: string;
    }>;
    markUserGoalSucceededNow: boolean;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt(input: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceiptInput): YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-user-goal-closeout-receipt.d.ts.map