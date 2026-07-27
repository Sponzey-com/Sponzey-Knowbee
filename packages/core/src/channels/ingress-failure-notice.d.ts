export type ChannelIngressFailureProvider = "slack" | "telegram";
export type ChannelIngressFailureLanguage = "ko" | "en" | "unknown";
export interface ChannelIngressFailureNotice {
    kind: "channel_ingress_failed";
    provider: ChannelIngressFailureProvider;
    language: ChannelIngressFailureLanguage;
    reason: string;
    text: string;
    deliveryMode: "diagnostic";
    textSource: "channel_ingress_failure_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildChannelIngressFailureNotice(input: {
    provider: ChannelIngressFailureProvider;
    userMessage: string;
    reason: string;
}): ChannelIngressFailureNotice;
//# sourceMappingURL=ingress-failure-notice.d.ts.map