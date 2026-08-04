import type { RequestExecutionOutcome, RequestExecutionOutcomeStatus } from "../runs/flow-contract.js";
import type { ApprovalInteractionDecision } from "./contracts.js";
import type { ChannelSmokeStatus } from "./smoke-runner.js";
export type ConversationVerificationChannel = "webui" | "telegram";
export type ConversationEvidenceMode = "fixture" | "browser" | "live";
export type ConversationVerificationStatus = "success" | "failure" | "blocked" | "cancelled" | "additional_input_required";
export type ConversationReleaseReadiness = "passed" | "failed" | "blocked";
export interface ConversationVerificationInput {
    scenarioId: string;
    channel: ConversationVerificationChannel;
    userRequest: string;
    expectedExecutionStatus: RequestExecutionOutcomeStatus;
    expectedTargetRef: string;
    allowedEffects: readonly string[];
    userReportExpected: boolean;
    requiresCapabilityAdmission?: boolean | undefined;
    requiresDistinctDecisionReceipts?: boolean | undefined;
}
export interface ConversationRunBinding {
    runId: string;
    requestGroupId: string;
    sessionId: string;
}
export interface ConversationDecisionReceipts {
    requestDiagnosisReceiptId: string;
    solutionPlanReceiptId: string;
    resultReviewReceiptId: string;
    finalResponseReceiptId: string;
    decisionReceiptOrderValid: boolean;
    capabilityAdmissionReceiptId?: string | undefined;
}
export interface ConversationProbeObservation {
    evidenceMode: ConversationEvidenceMode;
    smokeStatus: ChannelSmokeStatus;
    requestOutcome: RequestExecutionOutcome;
    binding: ConversationRunBinding;
    receipts: ConversationDecisionReceipts;
    finalization: {
        rootOwnerFinalized: boolean;
        finalAnswerCount: number;
    };
    deliveryTarget: {
        channel: ConversationVerificationChannel;
        targetRef: string;
    };
    pendingInteraction?: ConversationPendingInteraction | undefined;
}
export interface ConversationPendingInteraction {
    kind: "approval";
    approvalRequestRef: string;
}
export interface ConversationApprovalDecisionInteraction {
    kind: "approval_decision";
    approvalRequestRef: string;
    decision: ApprovalInteractionDecision;
}
export type ConversationControlInteraction = ConversationApprovalDecisionInteraction;
export type ConversationProbeResult<T = undefined> = ([T] extends [undefined] ? {
    status: "success";
} : {
    status: "success";
    value: T;
}) | {
    status: "failure";
    reasonCode: string;
} | {
    status: "blocked";
    reasonCode: string;
} | {
    status: "cancelled";
    reasonCode: string;
} | {
    status: "additional_input_required";
    reasonCode: string;
};
export interface ConversationProbePort {
    start(input: ConversationVerificationInput, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationRunBinding>>;
    observe(binding: ConversationRunBinding, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationProbeObservation>>;
}
export interface ConversationControlProbePort {
    interact(binding: ConversationRunBinding, interaction: Readonly<ConversationControlInteraction>, signal?: AbortSignal): Promise<ConversationProbeResult>;
    cancel(binding: ConversationRunBinding, signal?: AbortSignal): Promise<ConversationProbeResult>;
}
export interface ConversationDeliveryEvidence {
    delivered: boolean;
    channel: ConversationVerificationChannel;
    targetRef: string;
    receiptRef: string;
}
export interface ConversationDeliveryPostCheckPort {
    verifyDelivery(input: Readonly<{
        binding: ConversationRunBinding;
        expectedChannel: ConversationVerificationChannel;
        expectedTargetRef: string;
    }>, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationDeliveryEvidence>>;
}
export interface ConversationVerificationResult {
    verificationStatus: ConversationVerificationStatus;
    smokeStatus: ChannelSmokeStatus;
    observedRequestOutcome?: RequestExecutionOutcome;
    releaseReadiness: ConversationReleaseReadiness;
    evidenceMode?: ConversationEvidenceMode;
    reasonCode?: string;
    deliveryReceiptRef?: string;
}
export interface VerifyConversationProcessPorts {
    probe: ConversationProbePort;
    control: ConversationControlProbePort;
    delivery: ConversationDeliveryPostCheckPort;
}
export interface VerifyConversationProcessOptions {
    fixtureInteractions?: readonly ConversationControlInteraction[] | undefined;
}
export declare class VerifyConversationProcessUseCase {
    private readonly ports;
    private readonly options;
    constructor(ports: VerifyConversationProcessPorts, options?: Readonly<VerifyConversationProcessOptions>);
    execute(input: ConversationVerificationInput, signal?: AbortSignal): Promise<ConversationVerificationResult>;
}
//# sourceMappingURL=conversation-process-verification.d.ts.map