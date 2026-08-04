import type Database from "better-sqlite3";
import type { ApprovedOperationResumeCommand } from "../runs/approved-operation-resume.js";
import { type ApprovedOperationContinuationRepository, type ClaimApprovedOperationContinuationResult, type CancelApprovedOperationContinuationResult, type CompleteApprovedOperationContinuationResult, type EnqueueApprovedOperationContinuationResult, type FailApprovedOperationContinuationResult } from "../runs/approved-operation-continuation.js";
export declare class SqliteApprovedOperationContinuationRepository implements ApprovedOperationContinuationRepository {
    private readonly db;
    constructor(db: Database.Database);
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
    private load;
}
//# sourceMappingURL=approved-operation-continuation-repository.d.ts.map