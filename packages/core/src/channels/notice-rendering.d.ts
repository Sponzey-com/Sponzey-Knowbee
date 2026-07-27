import { type UserFacingNoticeRenderDependencies } from "../runs/user-facing-notice-rendering.js";
export interface ChannelNoticeRenderDependencies extends UserFacingNoticeRenderDependencies {
}
export type ChannelNoticeRenderResolution = {
    status: "ready";
    text: string;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export declare function renderChannelNoticeText(params: {
    originalRequest: string;
    rawText: string;
    dependencies?: ChannelNoticeRenderDependencies | undefined;
}): Promise<ChannelNoticeRenderResolution>;
//# sourceMappingURL=notice-rendering.d.ts.map