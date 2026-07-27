import { type CanonicalWorkEvent, type CanonicalWorkState, type CanonicalWorkTransitionDecision } from "./canonical-work-state.js";
export interface CanonicalWorkTransitionReceipt {
    revision: number;
    event: CanonicalWorkEvent;
    previousState: CanonicalWorkState;
    nextState: CanonicalWorkState;
    receiptRef: string;
}
export interface CanonicalWorkAggregate {
    workId: string;
    rootRunId: string;
    state: CanonicalWorkState;
    revision: number;
    transitions: CanonicalWorkTransitionReceipt[];
}
export type CanonicalWorkAggregateTransitionResult = {
    applied: true;
    aggregate: CanonicalWorkAggregate;
    receipt: CanonicalWorkTransitionReceipt;
} | {
    applied: false;
    reasonCode: "stale_revision";
    currentRevision: number;
} | {
    applied: false;
    reasonCode: Extract<CanonicalWorkTransitionDecision, {
        accepted: false;
    }>["reasonCode"];
};
export declare function canonicalWorkIdForRootRun(rootRunId: string): string;
export declare function createCanonicalWorkAggregate(input: {
    workId: string;
    rootRunId: string;
}): CanonicalWorkAggregate;
export declare function applyCanonicalWorkEvent(input: {
    aggregate: CanonicalWorkAggregate;
    expectedRevision: number;
    event: CanonicalWorkEvent;
    receiptRef: string;
}): CanonicalWorkAggregateTransitionResult;
//# sourceMappingURL=canonical-work-aggregate.d.ts.map