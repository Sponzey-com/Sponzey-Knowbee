import type { SubAgentResultReview } from "../agent/sub-agent-result-review.js";
import { type ChannelSource } from "../channels/contracts.js";
import type { EvidencePreservingResultAggregate } from "../contracts/result-review-decision.js";
import { type AgentAttributionSnapshot, type AgentNameSnapshot, type NamedDeliveryEvent, type ResultReport } from "../contracts/sub-agent-orchestration.js";
import { type DbMessageLedgerEvent } from "../db/index.js";
import { type AssistantTextDeliveryOutcome, type AssistantTextDeliveryReceipt, type CancellationReportDeliveryAuthorization, type RunChunkDeliveryHandler, emitAssistantTextDelivery } from "./delivery.js";
import { type LlmResponseReviewReceipt, type UserFacingResponseContentKind } from "./user-facing-response-gate.js";
import type { UserFacingTextSource } from "./loop-directive.js";
export type FinalDeliverySource = ChannelSource;
export type FinalDeliveryStatus = "delivered" | "duplicate_suppressed" | "blocked" | "delivery_failed";
export type FinalizerApprovalStatus = "requested" | "approved" | "approved_once" | "approved_run" | "consumed" | "denied" | "expired" | "superseded";
export interface FinalizerApprovalState {
    approvalId: string;
    status: FinalizerApprovalStatus;
    subSessionId?: string;
    agentId?: string;
    summary?: string;
    reasonCode?: string;
}
export interface FinalizerReviewState {
    subSessionId: string;
    review: Pick<SubAgentResultReview, "accepted" | "normalizedFailureKey"> & Partial<Pick<SubAgentResultReview, "verdict" | "parentIntegrationStatus">>;
}
export interface FinalDeliveryAttribution {
    resultReportId: string;
    subSessionId: string;
    source: AgentNameSnapshot;
    summary: string;
}
interface FinalDeliveryResponseReviewBase {
    rawTextSource: UserFacingTextSource;
    contentKind: UserFacingResponseContentKind;
    expectedLanguage: "ko" | "en" | "unknown";
    receipt: LlmResponseReviewReceipt;
}
export type FinalDeliveryResponseReview = FinalDeliveryResponseReviewBase & ({
    rawText: string;
    rawTextSha256?: never;
} | {
    rawTextSha256: string;
    rawText?: never;
});
export interface FinalDeliveryCommitResult {
    status: FinalDeliveryStatus;
    idempotencyKey: string;
    deliveryKey: string;
    text: string;
    attributions: FinalDeliveryAttribution[];
    reasonCodes: string[];
    existingEventId?: string;
    deliveryOutcome?: AssistantTextDeliveryOutcome;
    deliveryReceipt?: AssistantTextDeliveryReceipt;
}
export interface PendingFinalizerRestoreItem {
    parentRunId: string;
    requestGroupId: string | null;
    sessionKey: string | null;
    channel: string;
    deliveryKey: string;
    generatedEventId: string;
    generatedAt: number;
    safeToAutoDeliver: false;
    duplicateRisk: true;
}
export interface ApprovalAggregationResult {
    eventId: string | null;
    text: string;
    pendingApprovalIds: string[];
    blockedApprovalIds: string[];
    approvedApprovalIds: string[];
}
export declare function buildFinalDeliveryAttributions(resultReports?: readonly ResultReport[], rootAgentNameSnapshot?: string): FinalDeliveryAttribution[];
export declare function buildKnowbeeFinalAnswer(input: {
    text: string;
    resultReports?: readonly ResultReport[];
    rootAgentNameSnapshot?: string;
}): {
    text: string;
    attributions: FinalDeliveryAttribution[];
};
export declare function findCommittedFinalDelivery(parentRunId: string, options?: {
    source?: FinalDeliverySource;
    sessionId?: string;
}): DbMessageLedgerEvent | undefined;
export declare function commitFinalDelivery(input: {
    parentRunId: string;
    sessionId: string;
    source: FinalDeliverySource;
    text: string;
    onChunk: RunChunkDeliveryHandler | undefined;
    rootAgentNameSnapshot?: string;
    speaker?: AgentAttributionSnapshot;
    resultReports?: readonly ResultReport[];
    resultReviewAggregate?: EvidencePreservingResultAggregate;
    reviews?: readonly FinalizerReviewState[];
    approvals?: readonly FinalizerApprovalState[];
    responseReview?: FinalDeliveryResponseReview;
    cancellationReportAuthorization?: CancellationReportDeliveryAuthorization;
    deliveryDependencies?: NonNullable<Parameters<typeof emitAssistantTextDelivery>[0]["dependencies"]>;
    monotonicNow?: () => number;
    onDeliveryError?: (message: string) => void;
}): Promise<FinalDeliveryCommitResult>;
export declare function buildNamedResultDeliveryEvent(input: {
    parentRunId: string;
    sender: AgentAttributionSnapshot;
    recipient: AgentAttributionSnapshot;
    resultReportId: string;
    summary: string;
}): NamedDeliveryEvent;
export declare function recordApprovalAggregation(input: {
    parentRunId: string;
    sessionId: string;
    source: FinalDeliverySource;
    approvals: readonly FinalizerApprovalState[];
    speaker?: AgentAttributionSnapshot;
}): ApprovalAggregationResult;
export declare function listPendingFinalizers(input?: {
    runId?: string;
    requestGroupId?: string;
    limit?: number;
}): PendingFinalizerRestoreItem[];
export declare function recordLateResultNoReply(input: {
    parentRunId: string;
    subSessionId: string;
    agentId?: string;
    resultReportId: string;
    reasonCode?: string;
}): void;
export {};
//# sourceMappingURL=channel-finalizer.d.ts.map