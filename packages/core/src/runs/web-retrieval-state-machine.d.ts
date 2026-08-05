export type WebRetrievalState = "DIAGNOSED" | "SEARCH_PLANNED" | "SEARCHING" | "CANDIDATES_READY" | "FETCH_PLANNED" | "FETCHING" | "EVIDENCE_READY" | "VERIFYING" | "REDIAGNOSING" | "COMPLETED" | "BLOCKED" | "CANCELLED";
export interface WebRetrievalMachine {
    state: WebRetrievalState;
    attemptFingerprints: readonly string[];
    lastFailureReasonCode: string | null;
}
export type WebRetrievalEvent = {
    type: "search_planned";
    attemptFingerprint: string;
} | {
    type: "search_started";
} | {
    type: "search_succeeded";
} | {
    type: "fetch_planned";
    attemptFingerprint: string;
} | {
    type: "fetch_started";
} | {
    type: "fetch_succeeded";
} | {
    type: "verification_started";
} | {
    type: "verification_completed";
} | {
    type: "search_failed" | "fetch_failed" | "verification_failed";
    reasonCode: string;
} | {
    type: "blocked";
    reasonCode: string;
} | {
    type: "cancelled";
};
export type WebRetrievalTransition = {
    ok: true;
    value: WebRetrievalMachine;
} | {
    ok: false;
    reasonCode: "web_retrieval_transition_invalid" | "web_retrieval_attempt_duplicate" | "web_retrieval_terminal_state";
};
export declare function createWebRetrievalMachine(): WebRetrievalMachine;
export declare function transitionWebRetrieval(machine: WebRetrievalMachine, event: WebRetrievalEvent): WebRetrievalTransition;
//# sourceMappingURL=web-retrieval-state-machine.d.ts.map