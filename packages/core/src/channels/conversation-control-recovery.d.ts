import type { RequestDeliveryOutcomeStatus, RequestExecutionOutcomeStatus } from "../runs/flow-contract.js";
import type { ConversationVerificationChannel } from "./conversation-process-verification.js";
export type ConversationInteractionAdmission = "accepted" | "duplicate_rejected" | "expired_rejected" | "wrong_target_rejected" | "post_cancel_rejected";
export interface ConversationControlRecoveryObservation {
    channel: ConversationVerificationChannel;
    scenarioId: string;
    interactionAdmission: ConversationInteractionAdmission;
    transitionCount: number;
    executionStatus: RequestExecutionOutcomeStatus;
    deliveryStatus: RequestDeliveryOutcomeStatus;
    sideEffectCountAfterTerminal: number;
    retry: {
        attempted: boolean;
        previousStrategyFingerprint?: string;
        nextStrategyFingerprint?: string;
    };
    restartDelivery: {
        pendingAtRestart: boolean;
        admissionReceiptPresent: boolean;
        attempted: boolean;
    };
}
export interface ConversationControlRecoveryValidation {
    status: "passed" | "failed";
    failures: string[];
}
export declare function validateConversationControlRecoveryParity(observations: readonly ConversationControlRecoveryObservation[]): ConversationControlRecoveryValidation;
//# sourceMappingURL=conversation-control-recovery.d.ts.map