import type { RunChunkDeliveryHandler } from "./delivery.js";
import type { CompletionStageState } from "./completion-state.js";
import { completeRunWithAssistantMessage, markRunCompleted, type CanonicalDeliveryRecorder, type CanonicalPendingResponseConsumer, type CanonicalPendingResponseStager, type FinalizationDependencies, type FinalizationSource, type StandaloneAssistantMessageResponseContext } from "./finalization.js";
import { applyRecoveryRetryState, type RecoveryRetryApplicationDependencies } from "./retry-application.js";
import type { RecoveryBudgetUsage } from "./recovery-budget.js";
import type { NextAttemptToolPolicy } from "./next-attempt-tool-policy.js";
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js";
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
import { applyTerminalApplication } from "./terminal-application.js";
import { type CompletionApplicationDecision } from "./completion-application.js";
import { decideCompletionTerminalOutcome } from "./terminal-outcome-policy.js";
import { type UserFacingTextSource } from "./loop-directive.js";
export type CompletionApplicationPassResult = {
    kind: "break";
} | {
    kind: "retry";
    nextMessage: string;
    clearWorkerRuntime: boolean;
    structuredFollowupKey?: string;
    markTruncatedOutputRecoveryAttempted?: boolean;
    requiredToolNames?: string[];
    nextAttemptToolPolicy?: NextAttemptToolPolicy;
};
interface CompletionApplicationPassModuleDependencies {
    decideCompletionTerminalOutcome: typeof decideCompletionTerminalOutcome;
    completeRunWithAssistantMessage?: typeof completeRunWithAssistantMessage;
    markRunCompleted: typeof markRunCompleted;
    applyTerminalApplication: typeof applyTerminalApplication;
    applyRecoveryRetryState: typeof applyRecoveryRetryState;
}
export declare function applyCompletionApplicationPass(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    preview: string;
    previewSource?: UserFacingTextSource;
    deferredPreviewDelivery?: boolean;
    state: CompletionStageState;
    application: CompletionApplicationDecision;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    maxTurns: number;
    recoveryBudgetUsage: RecoveryBudgetUsage;
    finalizationDependencies: FinalizationDependencies;
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined;
    stageCanonicalPendingResponse?: CanonicalPendingResponseStager | undefined;
    consumeCanonicalPendingResponse?: CanonicalPendingResponseConsumer | undefined;
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined;
    terminalReport?: CanonicalResultReportFacts | undefined;
}, dependencies: RecoveryRetryApplicationDependencies, moduleDependencies?: CompletionApplicationPassModuleDependencies): Promise<CompletionApplicationPassResult>;
export {};
//# sourceMappingURL=completion-application-pass.d.ts.map