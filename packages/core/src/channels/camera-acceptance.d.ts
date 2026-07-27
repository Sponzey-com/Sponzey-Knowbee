export type CameraChannelAcceptanceSource = "webui" | "telegram";
export type CameraApprovalStatus = "awaiting" | "approved" | "rejected" | "expired";
export type CameraDeliveryApprovalStatus = CameraApprovalStatus | "not_required";
export type CameraCaptureStatus = "not_started" | "succeeded" | "failed";
export type CameraDeliveryStatus = "not_started" | "delivered" | "failed" | "partial";
export type CameraCompletionOutcome = "pending" | "complete" | "partial" | "blocked" | "cancelled";
export interface CameraChannelAcceptanceObservation {
    channel: CameraChannelAcceptanceSource;
    runId: string;
    requestGroupId: string;
    capabilityAdmission: {
        receiptId: string;
        capability: string;
        targetRef: string;
    };
    captureApproval: {
        status: CameraApprovalStatus;
        operationRef: string;
        targetRef: string;
    };
    deliveryApproval: {
        required: boolean;
        status: CameraDeliveryApprovalStatus;
        operationRef?: string;
        targetRef?: string;
    };
    capture: {
        dispatchCount: number;
        status: CameraCaptureStatus;
        targetRef?: string;
        artifact?: {
            artifactRef: string;
            mimeType: string;
            sizeBytes: number;
            verification: "verified" | "failed";
        };
    };
    delivery: {
        status: CameraDeliveryStatus;
        targetBound: boolean;
        receiptRef?: string;
        artifactCount: number;
        artifactBeforeFinal: boolean;
    };
    completionReview: {
        performed: boolean;
        outcome: CameraCompletionOutcome;
    };
    finalization: {
        reviewedFinalAnswer: boolean;
        finalAnswerCount: number;
    };
    publicProjectionSafe: boolean;
}
export interface CameraChannelAcceptanceValidation {
    status: "passed" | "failed";
    failures: string[];
}
export declare function validateCameraChannelAcceptance(observation: CameraChannelAcceptanceObservation): CameraChannelAcceptanceValidation;
//# sourceMappingURL=camera-acceptance.d.ts.map