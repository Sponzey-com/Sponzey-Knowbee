import type { ApprovedOperationResumeCommand } from "./approved-operation-resume.js";
export type ApprovedOperationContinuationStatus = "pending" | "claimed" | "completed" | "cancelled" | "failed";
export interface ApprovedOperationContinuation {
    readonly continuationId: string;
    readonly approvalId: string;
    readonly runId: string;
    readonly requestGroupId: string | null;
    readonly toolName: string;
    readonly decision: "allow_once" | "allow_run";
    readonly operationId: string;
    readonly operationBindingHash: `sha256:${string}`;
    readonly schemaVersion: 1;
    readonly status: ApprovedOperationContinuationStatus;
    readonly claimOwnerId: string | null;
    readonly claimExpiresAt: number | null;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly completedAt: number | null;
}
export type EnqueueApprovedOperationContinuationResult = {
    readonly status: "enqueued" | "existing";
    readonly continuation: ApprovedOperationContinuation;
} | {
    readonly status: "rejected";
    readonly reasonCode: "approval_continuation_source_invalid" | "approval_continuation_identity_conflict";
};
export type ClaimApprovedOperationContinuationResult = {
    readonly status: "claimed";
    readonly continuation: ApprovedOperationContinuation;
} | {
    readonly status: "none";
};
export type CompleteApprovedOperationContinuationResult = {
    readonly status: "completed";
    readonly continuation: ApprovedOperationContinuation;
} | {
    readonly status: "rejected";
    readonly reasonCode: "approval_continuation_not_found" | "approval_continuation_claim_mismatch";
};
export type FailApprovedOperationContinuationResult = {
    readonly status: "failed";
    readonly continuation: ApprovedOperationContinuation;
} | {
    readonly status: "rejected";
    readonly reasonCode: "approval_continuation_not_found" | "approval_continuation_claim_mismatch";
};
export type CancelApprovedOperationContinuationResult = {
    readonly status: "cancelled";
    readonly continuation: ApprovedOperationContinuation;
} | {
    readonly status: "rejected";
    readonly reasonCode: "approval_continuation_not_found" | "approval_continuation_claim_mismatch";
};
export interface ApprovedOperationContinuationRepository {
    enqueue(command: ApprovedOperationResumeCommand, now?: number): EnqueueApprovedOperationContinuationResult;
    claimNext(input: {
        ownerId: string;
        now?: number;
        leaseMs: number;
    }): ClaimApprovedOperationContinuationResult;
    claimById(input: {
        continuationId: string;
        ownerId: string;
        now?: number;
        leaseMs: number;
    }): ClaimApprovedOperationContinuationResult;
    complete(input: {
        continuationId: string;
        ownerId: string;
        now?: number;
    }): CompleteApprovedOperationContinuationResult;
    fail(input: {
        continuationId: string;
        ownerId: string;
        now?: number;
    }): FailApprovedOperationContinuationResult;
    cancel(input: {
        continuationId: string;
        ownerId: string;
        now?: number;
    }): CancelApprovedOperationContinuationResult;
}
export declare function approvedOperationContinuationId(approvalId: string): string;
//# sourceMappingURL=approved-operation-continuation.d.ts.map