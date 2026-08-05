import type { YeonjangExactTargetDecision } from "../contracts/yeonjang-target-resolution.js";
import { type UserFacingNoticeRenderDependencies, type UserFacingNoticeRenderResolution } from "./user-facing-notice-rendering.js";
type ClarificationDecision = Exclude<YeonjangExactTargetDecision, {
    status: "resolved";
}>;
export type YeonjangTargetClarificationResolution = {
    status: "ready";
    text: string;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export type YeonjangClarificationRenderer = (input: {
    originalRequest: string;
    rawText: string;
    textSource: "runtime_deterministic";
    contentKind: "validation_error";
    reasonPrefix: string;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
}) => Promise<UserFacingNoticeRenderResolution>;
export declare function renderYeonjangTargetClarification(input: {
    originalRequest: string;
    primaryLanguage: "ko" | "en";
    decision: ClarificationDecision;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
    renderNotice?: YeonjangClarificationRenderer | undefined;
}): Promise<YeonjangTargetClarificationResolution>;
export {};
//# sourceMappingURL=yeonjang-target-clarification.d.ts.map