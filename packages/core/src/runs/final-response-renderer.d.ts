import type { ResponseLanguageMode } from "../agent/intake.js";
import { type AIProvider, type AIProviderConfigSnapshot } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { UserFacingTextSource } from "./loop-directive.js";
import type { CanonicalExecutionFailurePhase } from "./canonical-execution-failure.js";
import { type LlmResponseReviewReceipt, type UserFacingResponseContentKind } from "./user-facing-response-gate.js";
export interface FinalResponseIdentityContext {
    promptLocale: "ko" | "en";
    mainAgentSelfName: string;
    promptContext: string;
}
/** Exact, allowlisted failure facts that a final-response model must acknowledge unchanged. */
export interface FinalResponseFailureEvidence {
    schemaVersion: 1;
    phase: CanonicalExecutionFailurePhase;
    reasonCode: string;
    retryable: boolean;
    executionObserved: boolean;
    deliveryObserved: boolean;
    evidenceRefs: readonly string[];
}
export interface FinalResponseRenderInput {
    runId?: string | undefined;
    requestGroupId?: string | undefined;
    sessionId?: string | undefined;
    originalRequest: string;
    rawText: string;
    textSource: UserFacingTextSource;
    responseLanguageMode?: ResponseLanguageMode | undefined;
    model: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: AIProviderConfigSnapshot;
    workDir: string;
    identityContext?: FinalResponseIdentityContext | undefined;
    contentKind?: UserFacingResponseContentKind | undefined;
    failureEvidence?: FinalResponseFailureEvidence | undefined;
}
export interface FinalResponseRenderResult {
    text: string;
    textSource: "llm_reviewed";
    promptSourceId: "final_response";
    rawTextSource: UserFacingTextSource;
    reviewReceipt?: LlmResponseReviewReceipt | undefined;
}
export declare function finalResponseRenderProvenanceEvent(input: {
    eventPrefix: string;
    rendered: Partial<FinalResponseRenderResult>;
    fallbackRawTextSource: UserFacingTextSource;
}): string;
export declare function buildFinalResponseIdentityContext(input: {
    config: KnowbeeConfig;
    originalRequest: string;
    workDir: string;
}): FinalResponseIdentityContext;
export declare function renderFinalResponseText(input: FinalResponseRenderInput): Promise<FinalResponseRenderResult | null>;
//# sourceMappingURL=final-response-renderer.d.ts.map