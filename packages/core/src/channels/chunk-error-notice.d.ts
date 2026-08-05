export type ChannelChunkErrorProvider = "slack" | "telegram";
export type ChannelChunkErrorLanguage = "ko" | "en";
export interface ChannelChunkErrorNotice {
    kind: "channel_chunk_error";
    provider: ChannelChunkErrorProvider;
    stage: "chunk_delivery";
    language: ChannelChunkErrorLanguage;
    reason: string;
    text: string;
    deliveryMode: "diagnostic";
    textSource: "channel_chunk_error_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildChannelChunkErrorNotice(input: {
    provider: ChannelChunkErrorProvider;
    language?: ChannelChunkErrorLanguage | undefined;
    reason: string;
}): ChannelChunkErrorNotice;
//# sourceMappingURL=chunk-error-notice.d.ts.map