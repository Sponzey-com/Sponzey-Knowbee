import type Database from "better-sqlite3";
import type { CanonicalPendingResponse, CanonicalPendingResponseFinalOutcome, CanonicalPendingResponseReviewEnvelope, CanonicalPendingResponseTextSource } from "../contracts/canonical-pending-response.js";
export declare class SqliteCanonicalPendingResponseRepository {
    private readonly db;
    private readonly now;
    constructor(db: Database.Database, now: () => number);
    stage(input: {
        runId: string;
        workId: string;
        sessionId: string;
        source: string;
        text: string;
        textSource: CanonicalPendingResponseTextSource;
        finalOutcome: CanonicalPendingResponseFinalOutcome;
        reviewEnvelope: CanonicalPendingResponseReviewEnvelope;
    }): {
        staged: true;
    } | {
        staged: false;
        reasonCode: "canonical_pending_response_conflict";
    };
    load(runId: string): CanonicalPendingResponse | undefined;
    loadPending(runId: string): CanonicalPendingResponse | undefined;
    listPending(limit?: number): CanonicalPendingResponse[];
    markConsumed(runId: string): {
        consumed: true;
    } | {
        consumed: false;
        reasonCode: "canonical_pending_response_not_found";
    };
}
//# sourceMappingURL=canonical-pending-response-repository.d.ts.map