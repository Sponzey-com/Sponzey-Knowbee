import type { ConversationVerificationChannel } from "./conversation-process-verification.js";
export interface ConversationDeliveryObservation {
    channel: ConversationVerificationChannel;
    scenarioId: string;
    reviewedFinalAnswer: boolean;
    finalAnswerCount: number;
    targetBound: boolean;
    deliveryReceiptPresent: boolean;
    artifactCount: number;
    artifactBeforeFinal: boolean;
    duplicateSuppressed: boolean;
    publicProjectionSafe: boolean;
    terminalState: "delivered" | "blocked" | "failed" | "cancelled";
}
export interface ConversationDeliveryParityValidation {
    status: "passed" | "failed";
    failures: string[];
}
export declare function validateConversationDeliveryParity(observations: readonly ConversationDeliveryObservation[]): ConversationDeliveryParityValidation;
//# sourceMappingURL=conversation-delivery-parity.d.ts.map