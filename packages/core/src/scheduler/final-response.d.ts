import { type AIProviderConfigSnapshot } from "../ai/index.js";
import { renderFinalResponseText as renderFinalResponseTextDefault, type FinalResponseIdentityContext } from "../runs/final-response-renderer.js";
import { type UserFacingTextSource } from "../runs/loop-directive.js";
import type { ResponseLanguageMode } from "../contracts/index.js";
export interface ScheduledFinalResponseRenderDependencies {
    renderFinalResponseText?: typeof renderFinalResponseTextDefault;
}
export type ScheduledFinalResponseRenderResult = {
    status: "ready";
    text: string;
    textSource: UserFacingTextSource | "llm_reviewed";
} | {
    status: "blocked";
    error: string;
};
export declare function renderScheduledFinalResponse(params: {
    originalRequest: string;
    rawText: string;
    textSource: UserFacingTextSource;
    responseLanguageMode?: ResponseLanguageMode | undefined;
    model?: string | undefined;
    config: AIProviderConfigSnapshot;
    workDir: string;
    identityContext?: FinalResponseIdentityContext | undefined;
    dependencies?: ScheduledFinalResponseRenderDependencies | undefined;
}): Promise<ScheduledFinalResponseRenderResult>;
//# sourceMappingURL=final-response.d.ts.map