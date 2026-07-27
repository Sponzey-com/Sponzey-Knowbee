import { type ChannelSmokeScenario, type ChannelSmokeTrace } from "./smoke-runner.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
import type { LiveSmokeLatencyEvidence } from "./live-smoke-terminal-observer.js";
export interface StartedCanonicalWebUiSmokeRequest {
    requestId: string;
    runId: string;
    requestGroupId: string;
}
export interface CanonicalWebUiSmokeToolReceipt {
    runId: string;
    requestGroupId: string;
    toolName: string;
    result: "success" | "failed" | "denied";
}
export interface CanonicalWebUiSmokeApprovalReceipt {
    runId: string;
    requestGroupId: string;
    channel: "webui";
    toolName: string;
    status: "requested" | "approved" | "consumed" | "denied" | "expired";
    uiVisible: boolean;
}
export interface CanonicalWebUiSmokeArtifactReceipt {
    runId: string;
    requestGroupId: string;
    channel: "webui";
    mode: "inline_preview" | "download_link";
    url: string;
}
export interface CanonicalWebUiSmokeCapabilityReceipt {
    runId: string;
    requestGroupId: string;
    capability: string;
    receiptStatus: "unsupported_capability";
}
export interface CanonicalWebUiSmokeObservation {
    requestId: string;
    runId: string;
    requestGroupId: string;
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
    toolReceipts?: readonly CanonicalWebUiSmokeToolReceipt[];
    approvalReceipts?: readonly CanonicalWebUiSmokeApprovalReceipt[];
    artifactReceipts?: readonly CanonicalWebUiSmokeArtifactReceipt[];
    capabilityReceipts?: readonly CanonicalWebUiSmokeCapabilityReceipt[];
    resultReviewReasonCodes?: readonly string[];
    userReportDelivered?: boolean;
    userReportDeliveryCount?: number;
    deliveryReceiptRef?: string;
    executionOutcome?: RequestExecutionOutcome;
    latencyEvidence?: LiveSmokeLatencyEvidence;
}
export interface WebUiLiveSmokeExecutorPorts {
    startRequest(input: {
        request: string;
        source: "webui";
    }): Promise<StartedCanonicalWebUiSmokeRequest> | StartedCanonicalWebUiSmokeRequest;
    observeTerminal(input: {
        started: StartedCanonicalWebUiSmokeRequest;
        signal?: AbortSignal;
    }): Promise<CanonicalWebUiSmokeObservation>;
}
export declare function createWebUiLiveSmokeExecutor(ports: WebUiLiveSmokeExecutorPorts): (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>;
//# sourceMappingURL=webui-live-smoke-executor.d.ts.map