import type { MessageLedgerDeliveryKind } from "./message-ledger.js";
export interface AssistantTextDeliveryNotice {
    kind: "assistant_text_delivery";
    deliveryMode: Extract<MessageLedgerDeliveryKind, "progress" | "final">;
    textSource: "assistant_text_delivery_notice";
    finalAnswer: boolean;
    assistantIdentityClaim: false;
}
export declare function buildAssistantTextDeliveryNotice(params: {
    deliveryKind: Extract<MessageLedgerDeliveryKind, "progress" | "final">;
    delivered: boolean;
}): AssistantTextDeliveryNotice;
//# sourceMappingURL=assistant-text-delivery-notice.d.ts.map