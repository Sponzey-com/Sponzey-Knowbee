import type { TruthfulNoYeonjangResult } from "../contracts/no-yeonjang-capability-gap.js";
import { type UserFacingNoticeRenderDependencies, type UserFacingNoticeRenderResolution } from "./user-facing-notice-rendering.js";
export type NoYeonjangCapabilityGuidanceResolution = {
    status: "ready";
    text: string;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export type NoYeonjangGuidanceRenderer = (input: {
    originalRequest: string;
    rawText: string;
    textSource: "runtime_deterministic";
    contentKind: "final_report";
    reasonPrefix: string;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
}) => Promise<UserFacingNoticeRenderResolution>;
export declare function renderNoYeonjangCapabilityGuidance(input: {
    originalRequest: string;
    primaryLanguage: "ko" | "en";
    result: TruthfulNoYeonjangResult;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
    renderNotice?: NoYeonjangGuidanceRenderer | undefined;
}): Promise<NoYeonjangCapabilityGuidanceResolution>;
//# sourceMappingURL=no-yeonjang-capability-guidance.d.ts.map