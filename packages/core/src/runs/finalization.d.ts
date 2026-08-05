import { type FinalDeliveryCommitResult } from "./channel-finalizer.js";
import type { AIProvider, AIProviderConfigSnapshot } from "../ai/index.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { ResponseLanguageMode } from "../agent/intake.js";
import type { AgentAttributionSnapshot } from "../contracts/sub-agent-orchestration.js";
import { type CancellationReportDeliveryAuthorization, type RunChunkDeliveryHandler, emitAssistantTextDelivery } from "./delivery.js";
import { type DirectAnswerResponseReview, type UserFacingTextSource } from "./loop-directive.js";
import { type FinalResponseFailureEvidence, type FinalResponseIdentityContext, renderFinalResponseText as renderFinalResponseTextDefault } from "./final-response-renderer.js";
import type { RunStatus, RunStepStatus } from "./types.js";
import { type CanonicalFinalizationTransitionDescriptor } from "./canonical-finalization-lifecycle.js";
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js";
import type { CanonicalPendingResponseReviewEnvelope } from "../contracts/canonical-pending-response.js";
import { type UserFacingResponseContentKind } from "./user-facing-response-gate.js";
import type { CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
import type { FirstResponseReceiptRecorder } from "./first-response-receipt.js";
export type FinalizationSource = ChannelSource;
export type FinalValidationMode = "general" | "current_fact";
export type FinalValidationScope = "parent_finalizer";
export type FinalValidationValueConfidence = "verified" | "candidate" | "unverified" | "conflict";
export interface FinalValidationRequiredValue {
    valueId: string;
    label: string;
    required: boolean;
}
export interface FinalValidationObservedValue {
    valueId: string;
    label?: string;
    value?: string;
    unit?: string;
    confidence: FinalValidationValueConfidence;
    sourceId?: string;
    sourceLabel?: string;
    sourceUrl?: string;
    sourceDomain?: string;
    sourceTimestamp?: string | null;
    fetchTimestamp?: string | null;
    basisTime?: string | null;
    conflicts?: string[];
}
export interface FinalValidationMissingValue {
    valueId: string;
    label: string;
    reasonCode: string;
}
export interface FinalValidationSourceRef {
    sourceId: string;
    sourceLabel?: string;
    sourceUrl?: string;
    sourceDomain?: string;
    sourceTimestamp?: string | null;
    fetchTimestamp?: string | null;
    reliability?: string;
    role?: string;
    status?: string;
}
export interface FinalValidationConflict {
    valueId?: string;
    summary: string;
    sourceIds?: string[];
    selectionBasis?: string;
}
export interface FinalValidationInput {
    mode: FinalValidationMode;
    validationScope?: FinalValidationScope;
    requiredValues?: FinalValidationRequiredValue[];
    observedValues?: FinalValidationObservedValue[];
    missingValues?: FinalValidationMissingValue[];
    sourceList?: FinalValidationSourceRef[];
    sourceTimestamps?: string[];
    conflicts?: FinalValidationConflict[];
    reasonCodes?: string[];
    basisTime?: string | null;
    recoveryAvailable?: boolean;
    safeAlternativesExhausted?: boolean;
}
export type FinalValidationStatus = "ready" | "needs_recovery" | "limited_failure_allowed";
export interface FinalValidationTrace {
    mode: FinalValidationMode;
    validationScope: FinalValidationScope;
    requiredValues: FinalValidationRequiredValue[];
    observedValues: FinalValidationObservedValue[];
    missingValues: FinalValidationMissingValue[];
    sourceList: FinalValidationSourceRef[];
    sourceTimestamps: string[];
    conflicts: FinalValidationConflict[];
    reasonCodes: string[];
    basisTime?: string | null;
    recoveryAvailable: boolean;
    safeAlternativesExhausted: boolean;
}
export interface FinalValidationDecision {
    status: FinalValidationStatus;
    finalDeliveryAllowed: boolean;
    reasonCodes: string[];
    summary: string;
    trace: FinalValidationTrace;
}
export interface FinalizationOutcome {
    status: "completed" | "blocked_by_final_validation" | "blocked_by_final_response_rendering" | "blocked_by_delivery" | "blocked_by_canonical_delivery";
    finalValidation?: FinalValidationDecision;
}
export type CanonicalDeliveryRecorder = (descriptor: CanonicalFinalizationTransitionDescriptor) => Promise<{
    ok: true;
} | {
    ok: false;
    reasonCode: string;
}>;
export type CanonicalPendingResponseStager = (input: {
    runId: string;
    workId: string;
    sessionId: string;
    source: FinalizationSource;
    text: string;
    textSource: UserFacingTextSource;
    finalOutcome: CanonicalFinalOutcome;
    reviewEnvelope: CanonicalPendingResponseReviewEnvelope;
}) => Promise<{
    ok: true;
} | {
    ok: false;
    reasonCode: string;
}>;
export type CanonicalPendingResponseConsumer = (runId: string) => Promise<{
    ok: true;
} | {
    ok: false;
    reasonCode: string;
}>;
export interface AwaitingUserParams {
    preview: string;
    summary: string;
    reason?: string;
    rawMessage?: string;
    userMessage?: string;
    remainingItems?: string[];
}
export interface StandaloneAssistantMessageResponseContext {
    originalRequest: string;
    responseLanguageMode?: ResponseLanguageMode | undefined;
    model: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: AIProviderConfigSnapshot;
    workDir: string;
    identityContext?: FinalResponseIdentityContext | undefined;
    failureEvidence?: FinalResponseFailureEvidence | undefined;
}
export interface StandaloneAssistantMessageNotice {
    kind: string;
    textSource: string;
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
    contentKind?: UserFacingResponseContentKind | undefined;
}
export interface FinalizationDependencies {
    appendRunEvent: (runId: string, message: string) => void;
    setRunStepStatus: (runId: string, step: string, status: RunStepStatus, summary: string) => unknown;
    updateRunStatus: (runId: string, status: RunStatus, summary: string, active: boolean) => unknown;
    rememberRunSuccess: (params: {
        runId: string;
        sessionId: string;
        source: FinalizationSource;
        text: string;
        summary: string;
    }) => void;
    rememberRunFailure: (params: {
        runId: string;
        sessionId: string;
        source: FinalizationSource;
        summary: string;
        detail?: string;
        title?: string;
    }) => void;
    rememberRunAwaitingUser?: (params: {
        runId: string;
        sessionId: string;
        source: FinalizationSource;
        summary: string;
        reason?: string;
        userMessage?: string;
        remainingItems?: string[];
    }) => void;
    onDeliveryError?: (message: string) => void;
    recordFirstResponseReceipt?: FirstResponseReceiptRecorder;
    firstResponseMonotonicNow?: () => number;
    deliveryDependencies?: NonNullable<Parameters<typeof emitAssistantTextDelivery>[0]["dependencies"]>;
}
export declare function recordFirstResponseFromFinalDelivery(delivery: Pick<FinalDeliveryCommitResult, "status" | "deliveryReceipt">, recorder: FirstResponseReceiptRecorder | undefined): void;
export declare function validateAndFinalize(input: FinalValidationInput): FinalValidationDecision;
export declare class ValidateAndFinalize {
    decide(input: FinalValidationInput): FinalValidationDecision;
}
export declare function markRunCompleted(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    text: string;
    summary: string;
    executingSummary?: string;
    reviewingSummary?: string;
    finalizingSummary?: string;
    completedSummary?: string;
    eventLabel?: string;
    dependencies: FinalizationDependencies;
}): void;
export declare function completeRunWithAssistantMessage(params: {
    runId: string;
    sessionId: string;
    text: string;
    textSource?: UserFacingTextSource | undefined;
    preauthorizedResponseReview?: DirectAnswerResponseReview | undefined;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    renderFinalResponseText?: typeof renderFinalResponseTextDefault | undefined;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    suppressFinalDelivery?: boolean;
    suppressFinalDeliveryReasonCode?: string;
    speaker?: AgentAttributionSnapshot;
    finalValidation?: FinalValidationInput;
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined;
    stageCanonicalPendingResponse?: CanonicalPendingResponseStager | undefined;
    consumeCanonicalPendingResponse?: CanonicalPendingResponseConsumer | undefined;
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined;
    cancellationReportAuthorization?: CancellationReportDeliveryAuthorization | undefined;
    terminalReport?: CanonicalResultReportFacts | undefined;
    preserveRunStatusAfterDelivery?: boolean | undefined;
    dependencies: FinalizationDependencies;
}): Promise<FinalizationOutcome>;
export declare function emitStandaloneAssistantMessage(params: {
    runId: string;
    sessionId: string;
    text: string;
    textSource?: UserFacingTextSource | undefined;
    notice?: StandaloneAssistantMessageNotice | undefined;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    renderFinalResponseText?: typeof renderFinalResponseTextDefault | undefined;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    dependencies: Pick<FinalizationDependencies, "appendRunEvent" | "onDeliveryError" | "deliveryDependencies">;
}): Promise<void>;
export declare function moveRunToAwaitingUser(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    awaitingUser: AwaitingUserParams;
    textSource?: UserFacingTextSource | undefined;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    dependencies: FinalizationDependencies;
}): Promise<void>;
export declare function moveRunToCancelledAfterStop(params: {
    runId: string;
    sessionId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    cancellation: AwaitingUserParams;
    textSource?: UserFacingTextSource | undefined;
    responseContext?: StandaloneAssistantMessageResponseContext | undefined;
    recordCanonicalDelivery?: CanonicalDeliveryRecorder | undefined;
    canonicalFinalOutcome?: CanonicalFinalOutcome | undefined;
    terminalReport?: CanonicalResultReportFacts | undefined;
    dependencies: FinalizationDependencies;
}): Promise<void>;
export declare function buildAwaitingUserMessage(params: AwaitingUserParams): string;
//# sourceMappingURL=finalization.d.ts.map