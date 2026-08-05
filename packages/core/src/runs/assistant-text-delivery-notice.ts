import type { MessageLedgerDeliveryKind } from "./message-ledger.js"

export interface AssistantTextDeliveryNotice {
  kind: "assistant_text_delivery"
  deliveryMode: Extract<MessageLedgerDeliveryKind, "progress" | "final">
  textSource: "assistant_text_delivery_notice"
  finalAnswer: boolean
  assistantIdentityClaim: false
}

export function buildAssistantTextDeliveryNotice(params: {
  deliveryKind: Extract<MessageLedgerDeliveryKind, "progress" | "final">
  delivered: boolean
}): AssistantTextDeliveryNotice {
  return {
    kind: "assistant_text_delivery",
    deliveryMode: params.deliveryKind,
    textSource: "assistant_text_delivery_notice",
    finalAnswer: params.deliveryKind === "final" && params.delivered,
    assistantIdentityClaim: false,
  }
}
