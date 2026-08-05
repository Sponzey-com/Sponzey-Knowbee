export function resolveCanonicalTransitionCursor(input) {
    if (!input.aggregate) {
        return {
            ok: false,
            reasonCode: "canonical_transition_aggregate_not_found",
        };
    }
    if (input.aggregate.state !== input.expectedState) {
        return {
            ok: false,
            reasonCode: "canonical_transition_state_mismatch",
            currentState: input.aggregate.state,
            currentRevision: input.aggregate.revision,
        };
    }
    return {
        ok: true,
        expectedRevision: input.aggregate.revision,
    };
}
//# sourceMappingURL=canonical-transition-cursor.js.map