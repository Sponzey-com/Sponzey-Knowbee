import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { CanonicalWorkState } from "../contracts/canonical-work-state.js";
export type CanonicalTransitionCursorResult = {
    ok: true;
    expectedRevision: number;
} | {
    ok: false;
    reasonCode: "canonical_transition_aggregate_not_found";
} | {
    ok: false;
    reasonCode: "canonical_transition_state_mismatch";
    currentState: CanonicalWorkState;
    currentRevision: number;
};
export declare function resolveCanonicalTransitionCursor(input: {
    aggregate: CanonicalWorkAggregate | undefined;
    expectedState: CanonicalWorkState;
}): CanonicalTransitionCursorResult;
//# sourceMappingURL=canonical-transition-cursor.d.ts.map