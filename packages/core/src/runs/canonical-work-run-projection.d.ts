import type { CanonicalWorkState } from "../contracts/canonical-work-state.js";
import type { RunStatus } from "./types.js";
export type CanonicalWaitingKind = "approval" | "user_input";
export type CanonicalFinalOutcome = "succeeded" | "partial" | "blocked" | "exhausted" | "cancelled";
export interface CanonicalRunStatusProjection {
    canonicalState: CanonicalWorkState;
    runStatus: RunStatus;
    lossy: true;
}
export type CanonicalRunStatusProjectionResult = {
    ok: true;
    projection: CanonicalRunStatusProjection;
} | {
    ok: false;
    canonicalState: CanonicalWorkState;
    reasonCode: "waiting_kind_required" | "final_report_outcome_required";
};
export declare function projectCanonicalWorkStateToRunStatus(input: {
    state: CanonicalWorkState;
    waitingKind?: CanonicalWaitingKind;
    finalOutcome?: CanonicalFinalOutcome;
}): CanonicalRunStatusProjectionResult;
//# sourceMappingURL=canonical-work-run-projection.d.ts.map