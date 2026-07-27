export function buildAssistantTextDeliveryNotice(params) {
    return {
        kind: "assistant_text_delivery",
        deliveryMode: params.deliveryKind,
        textSource: "assistant_text_delivery_notice",
        finalAnswer: params.deliveryKind === "final" && params.delivered,
        assistantIdentityClaim: false,
    };
}
//# sourceMappingURL=assistant-text-delivery-notice.js.map