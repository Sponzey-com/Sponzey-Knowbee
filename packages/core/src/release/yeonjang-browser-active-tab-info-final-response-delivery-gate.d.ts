import type { YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt, YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus } from "./yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryAcknowledgementStatus = "acknowledged" | "missing";
export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode = "final_response_delivery_gate_llm_post_check_receipt_not_ready" | "final_response_delivery_gate_decision_not_satisfied" | "final_response_delivery_gate_final_response_projection_ref_invalid" | "final_response_delivery_gate_product_log_evidence_ref_invalid" | "final_response_delivery_gate_delivery_acknowledgement_missing";
export interface YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateInput {
    llmPostCheckDecisionReceipt: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt;
    finalResponseProjectionRef: string;
    productLogEvidenceRef: string;
    deliveryChannelAcknowledgement: YeonjangBrowserActiveTabInfoFinalResponseDeliveryAcknowledgementStatus;
}
export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-response-delivery-gate.v1";
    method: "browser.active_tab_info";
    status: "final_response_delivery_gate_ready" | "blocked";
    reasonCode: "active_tab_info_final_response_delivery_gate_ready" | "active_tab_info_final_response_delivery_gate_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode[];
    gate?: Readonly<{
        finalDeliveryGateId: string;
        llmPostCheckDecisionReceiptId: string;
        decisionStatus: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus;
        finalResponseProjectionRef: string;
        productLogEvidenceRef: string;
        deliveryChannelAcknowledgementStatus: "acknowledged";
    }>;
    deliverFinalResponseNow: boolean;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate(input: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateInput): YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-response-delivery-gate.d.ts.map