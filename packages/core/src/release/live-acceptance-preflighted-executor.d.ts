import type { LiveAcceptanceBundleApproval, LiveAcceptanceBundleCandidate } from "./live-acceptance-bundle.js";
import type { LiveAcceptanceExecutionSelection } from "./live-acceptance-execution-request.js";
import type { LiveAcceptanceRunnerResult } from "./live-acceptance-runner.js";
import { type LiveAcceptanceRuntimeSnapshot, type LiveAcceptanceSelectionPreflightResult } from "./live-acceptance-selection-preflight.js";
export interface LiveAcceptancePreflightedExecutionInput {
    readonly candidate: Readonly<LiveAcceptanceBundleCandidate>;
    readonly approval: Readonly<LiveAcceptanceBundleApproval>;
    readonly selection: Readonly<LiveAcceptanceExecutionSelection>;
    readonly requestedKeyId: string;
    readonly signal: AbortSignal;
}
export interface LiveAcceptanceVerifiedExecutionContext {
    readonly candidate: Readonly<LiveAcceptanceBundleCandidate>;
    readonly approval: Readonly<LiveAcceptanceBundleApproval>;
    readonly requestedKeyId: string;
    readonly observedAt: number;
    readonly signal: AbortSignal;
    readonly preflight: Extract<LiveAcceptanceSelectionPreflightResult, {
        status: "verified";
    }>;
}
export type LiveAcceptanceVerifiedExecutor = (context: LiveAcceptanceVerifiedExecutionContext) => Promise<LiveAcceptanceRunnerResult>;
export type LiveAcceptancePreflightedExecutor = (input: LiveAcceptancePreflightedExecutionInput) => Promise<LiveAcceptanceRunnerResult>;
export declare function createPreflightedLiveAcceptanceExecutor(input: {
    readonly now: () => number;
    readonly maxYeonjangAgeMs: number;
    readonly captureSnapshot: (capturedAt: number) => LiveAcceptanceRuntimeSnapshot;
    readonly executeVerified: LiveAcceptanceVerifiedExecutor;
}): LiveAcceptancePreflightedExecutor;
//# sourceMappingURL=live-acceptance-preflighted-executor.d.ts.map