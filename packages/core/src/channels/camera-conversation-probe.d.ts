import type { CameraChannelAcceptanceObservation } from "./camera-acceptance.js";
import type { ConversationDecisionReceipts, ConversationEvidenceMode, ConversationProbeObservation, ConversationProbeResult, ConversationProbePort, ConversationRunBinding, ConversationVerificationInput, ConversationVerificationChannel } from "./conversation-process-verification.js";
import type { ChannelSmokeStatus } from "./smoke-runner.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
export interface CameraConversationPreEffectFacts {
    evidenceMode: ConversationEvidenceMode;
    smokeStatus: ChannelSmokeStatus;
    binding: ConversationRunBinding;
    requestOutcome: RequestExecutionOutcome;
    receipts: ConversationDecisionReceipts;
    deliveryTarget: {
        channel: ConversationVerificationChannel;
        targetRef: string;
    };
    approval: {
        approvalRequestRef: string;
        runId: string;
        requestGroupId: string;
        toolName: string;
        status: "requested";
        executionTargetFingerprint: string;
    };
    capabilityAdmission: {
        receiptId: string;
        capability: string;
        executionTargetFingerprint: string;
    };
    effect: {
        startEffectCount: number;
        remoteCaptureCount: number;
    };
}
export interface CameraConversationPreEffectSnapshot {
    conversation: ConversationProbeObservation;
    camera: CameraChannelAcceptanceObservation;
}
export interface CameraConversationPostEffectFacts {
    evidenceMode: ConversationEvidenceMode;
    smokeStatus: ChannelSmokeStatus;
    binding: ConversationRunBinding;
    requestOutcome: RequestExecutionOutcome;
    receipts: ConversationDecisionReceipts;
    deliveryTarget: {
        channel: ConversationVerificationChannel;
        targetRef: string;
    };
    approval: {
        approvalRequestRef: string;
        runId: string;
        requestGroupId: string;
        toolName: string;
        status: "consumed";
        executionTargetFingerprint: string;
    };
    capabilityAdmission: {
        receiptId: string;
        capability: string;
        executionTargetFingerprint: string;
    };
    effect: {
        startEffectCount: number;
        remoteCaptureCount: number;
        verificationPassedCount: number;
    };
    artifact: {
        artifactRef: string;
        mimeType: string;
        sizeBytes: number;
        verification: "verified";
    };
}
export type CameraConversationPostEffectSnapshot = CameraConversationPreEffectSnapshot;
export interface CameraConversationDeliveryApprovalFacts {
    capture: CameraConversationPostEffectFacts;
    deliveryApproval: {
        approvalRequestRef: string;
        runId: string;
        requestGroupId: string;
        toolName: "telegram_send_file";
        status: "requested";
        executionTargetFingerprint: string;
        artifactRef: string;
    };
}
export interface CameraConversationCompletedFacts {
    capture: CameraConversationPostEffectFacts;
    requestOutcome: RequestExecutionOutcome & {
        executionStatus: "succeeded";
        deliveryStatus: "delivered";
    };
    deliveryApproval: {
        approvalRequestRef: string;
        runId: string;
        requestGroupId: string;
        toolName: "telegram_send_file";
        status: "consumed";
        executionTargetFingerprint: string;
        artifactRef: string;
    };
    delivery: {
        providerSendCount: number;
        receiptCount: number;
        receiptRef: string;
        artifactRef: string;
        executionTargetFingerprint: string;
    };
    completionReview: {
        invocationCount: number;
        receiptId: string;
        status: "complete";
    };
    finalResponse: {
        deliveryCount: number;
        receiptId: string;
        language: "ko" | "en";
        rootOwnerFinalized: true;
    };
}
export interface CameraConversationProbeAdapterDependencies {
    startRootRun(input: ConversationVerificationInput, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationRunBinding>>;
    readPreEffectFacts(binding: ConversationRunBinding, signal?: AbortSignal): Promise<ConversationProbeResult<CameraConversationPreEffectFacts>>;
    consumeSnapshot?(snapshot: Readonly<CameraConversationPreEffectSnapshot>): void;
}
export declare class CameraConversationProbeAdapter implements ConversationProbePort {
    private readonly dependencies;
    constructor(dependencies: Readonly<CameraConversationProbeAdapterDependencies>);
    start(input: ConversationVerificationInput, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationRunBinding>>;
    observe(binding: ConversationRunBinding, signal?: AbortSignal): Promise<ConversationProbeResult<ConversationProbeObservation>>;
}
export declare function projectCameraConversationPreEffectSnapshot(facts: Readonly<CameraConversationPreEffectFacts>): ConversationProbeResult<CameraConversationPreEffectSnapshot>;
export declare function projectCameraConversationPostEffectSnapshot(facts: Readonly<CameraConversationPostEffectFacts>): ConversationProbeResult<CameraConversationPostEffectSnapshot>;
export declare function projectCameraConversationDeliveryApprovalSnapshot(facts: Readonly<CameraConversationDeliveryApprovalFacts>): ConversationProbeResult<CameraConversationPostEffectSnapshot>;
export declare function projectCameraConversationCompletedSnapshot(facts: Readonly<CameraConversationCompletedFacts>): ConversationProbeResult<CameraConversationPostEffectSnapshot>;
//# sourceMappingURL=camera-conversation-probe.d.ts.map