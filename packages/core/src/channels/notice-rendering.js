import { renderUserFacingNoticeText, } from "../runs/user-facing-notice-rendering.js";
export async function renderChannelNoticeText(params) {
    return renderUserFacingNoticeText({
        originalRequest: params.originalRequest,
        rawText: params.rawText,
        reasonPrefix: "channel_notice",
        dependencies: params.dependencies,
    });
}
//# sourceMappingURL=notice-rendering.js.map