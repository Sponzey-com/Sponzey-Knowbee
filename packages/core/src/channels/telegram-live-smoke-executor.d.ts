import { type ChannelSmokeScenario, type ChannelSmokeTrace } from "./smoke-runner.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
import type { LiveSmokeLatencyEvidence } from "./live-smoke-terminal-observer.js";
export interface StartedCanonicalTelegramSmokeRequest {
    requestId: string;
    runId: string;
    requestGroupId: string;
    targetFingerprint: string;
}
export interface CanonicalTelegramSmokeToolReceipt {
    runId: string;
    requestGroupId: string;
    toolName: string;
    result: "success" | "failed" | "denied";
}
export interface CanonicalTelegramSmokeApprovalReceipt {
    runId: string;
    requestGroupId: string;
    channel: "telegram";
    toolName: string;
    status: "requested" | "approved" | "consumed" | "denied" | "expired";
    uiVisible: boolean;
}
export interface CanonicalTelegramSmokeArtifactReceipt {
    runId: string;
    requestGroupId: string;
    channel: "telegram";
    mode: "native_file" | "download_link";
    url?: string;
}
export interface CanonicalTelegramSmokeCapabilityReceipt {
    runId: string;
    requestGroupId: string;
    capability: string;
    receiptStatus: "unsupported_capability";
}
export interface CanonicalTelegramSmokeObservation extends StartedCanonicalTelegramSmokeRequest {
    terminalStatus: "completed" | "failed" | "cancelled" | "interrupted" | "timed_out";
    typedTraceStatus: "ready" | "not_recorded" | "unavailable";
    typedTraceTerminal: boolean;
    typedTraceIssueCount: number;
    analysisCompleted: boolean;
    directResponseReceiptId?: string;
    directResponseReceiptValid?: boolean;
    requestDiagnosisReceiptId?: string;
    solutionPlanReceiptId?: string;
    capabilityAdmissionReceiptId?: string;
    evidenceRecorded: boolean;
    reviewCompleted: boolean;
    resultReviewReceiptId?: string;
    finalResponseReceiptId?: string;
    decisionReceiptOrderValid?: boolean;
    finalizationCompleted: boolean;
    rootOwnerFinalized?: boolean;
    finalAnswerCount?: number;
    topologyRunCount: number;
    auditEventId?: string;
    providerDeliveryReceipted: boolean;
    targetMatched: boolean;
    userReportDelivered: boolean;
    userReportDeliveryCount?: number;
    deliveryReceiptRef?: string;
    capabilitySelectionDecisionTraceId?: string;
    toolReceipts?: readonly CanonicalTelegramSmokeToolReceipt[];
    approvalReceipts?: readonly CanonicalTelegramSmokeApprovalReceipt[];
    artifactReceipts?: readonly CanonicalTelegramSmokeArtifactReceipt[];
    capabilityReceipts?: readonly CanonicalTelegramSmokeCapabilityReceipt[];
    resultReviewReasonCodes?: readonly string[];
    executionOutcome?: RequestExecutionOutcome;
    latencyEvidence?: LiveSmokeLatencyEvidence;
}
export interface TelegramLiveSmokeExecutorPorts {
    startRequest(input: {
        request: string;
        source: "telegram";
    }): Promise<StartedCanonicalTelegramSmokeRequest> | StartedCanonicalTelegramSmokeRequest;
    observeTerminal(input: {
        started: StartedCanonicalTelegramSmokeRequest;
        signal?: AbortSignal;
    }): Promise<CanonicalTelegramSmokeObservation>;
}
export declare function createTelegramLiveSmokeExecutor(ports: TelegramLiveSmokeExecutorPorts): (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>;
//# sourceMappingURL=telegram-live-smoke-executor.d.ts.map