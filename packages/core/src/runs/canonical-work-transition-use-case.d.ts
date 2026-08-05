import { type CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js";
import { type CanonicalFinalOutcome, type CanonicalRunStatusProjection, type CanonicalWaitingKind } from "./canonical-work-run-projection.js";
export interface CanonicalWorkRepository {
    load(workId: string): CanonicalWorkAggregate | undefined;
    save(input: {
        aggregate: CanonicalWorkAggregate;
        expectedRevision: number;
    }): {
        saved: true;
    } | {
        saved: false;
        reasonCode: "revision_conflict";
        currentRevision: number;
    };
}
export interface CanonicalWorkTransitionUseCaseInput {
    workId: string;
    expectedRevision: number;
    event: CanonicalWorkEvent;
    receiptRef: string;
    waitingKind?: CanonicalWaitingKind;
    finalOutcome?: CanonicalFinalOutcome;
}
export type CanonicalWorkTransitionUseCaseResult = {
    status: "applied";
    aggregate: CanonicalWorkAggregate;
    runProjection: CanonicalRunStatusProjection;
} | {
    status: "rejected";
    reasonCode: "aggregate_not_found" | "aggregate_identity_mismatch" | "stale_revision" | "receipt_required" | "transition_not_allowed" | "terminal_state_locked" | "waiting_kind_required" | "final_report_outcome_required";
    currentRevision?: number;
} | {
    status: "conflict";
    reasonCode: "revision_conflict";
    currentRevision: number;
};
export declare function executeCanonicalWorkTransition(input: {
    repository: CanonicalWorkRepository;
    input: CanonicalWorkTransitionUseCaseInput;
}): CanonicalWorkTransitionUseCaseResult;
//# sourceMappingURL=canonical-work-transition-use-case.d.ts.map