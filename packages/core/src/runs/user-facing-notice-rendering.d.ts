import { type AIProvider } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import { renderFinalResponseText as renderFinalResponseTextDefault, type FinalResponseIdentityContext } from "./final-response-renderer.js";
import type { UserFacingTextSource } from "./loop-directive.js";
import { type UserFacingResponseContentKind } from "./user-facing-response-gate.js";
export interface UserFacingNoticeRenderDependencies {
    renderFinalResponseText?: typeof renderFinalResponseTextDefault;
    getDefaultModel?: () => string;
    getProvider?: () => AIProvider;
    workDir?: string;
    config?: KnowbeeConfig | undefined;
    identityContext?: FinalResponseIdentityContext | undefined;
}
export type UserFacingNoticeRenderResolution = {
    status: "ready";
    text: string;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export declare function renderUserFacingNoticeText(params: {
    originalRequest: string;
    rawText: string;
    textSource?: UserFacingTextSource | undefined;
    contentKind?: UserFacingResponseContentKind | undefined;
    reasonPrefix?: string | undefined;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
}): Promise<UserFacingNoticeRenderResolution>;
//# sourceMappingURL=user-facing-notice-rendering.d.ts.map