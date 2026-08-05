import type { ResponseLanguageMode } from "../agent/intake.js";
import type { AIProvider, AIProviderConfigSnapshot } from "../ai/index.js";
import type { RunChunkDeliveryHandler } from "./delivery.js";
import { type FinalResponseIdentityContext, renderFinalResponseText } from "./final-response-renderer.js";
import { type FinalizationDependencies, type FinalizationSource, completeRunWithAssistantMessage, markRunCompleted } from "./finalization.js";
import { type LoopDirective } from "./loop-directive.js";
import { applyTerminalApplication } from "./terminal-application.js";
interface LoopDirectiveApplicationModuleDependencies {
    completeRunWithAssistantMessage: typeof completeRunWithAssistantMessage;
    markRunCompleted: typeof markRunCompleted;
    applyTerminalApplication: typeof applyTerminalApplication;
    renderFinalResponseText: typeof renderFinalResponseText;
}
export interface LoopDirectiveResponseContext {
    originalRequest: string;
    responseLanguageMode?: ResponseLanguageMode | undefined;
    model: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: AIProviderConfigSnapshot;
    workDir: string;
    identityContext?: FinalResponseIdentityContext | undefined;
}
export declare function applyLoopDirective(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    directive: LoopDirective;
    responseContext?: LoopDirectiveResponseContext | undefined;
    finalizationDependencies: FinalizationDependencies;
    suppressFinalDelivery?: boolean;
    suppressFinalDeliveryReasonCode?: string;
}, moduleDependencies?: LoopDirectiveApplicationModuleDependencies): Promise<"break">;
export {};
//# sourceMappingURL=loop-directive-application.d.ts.map