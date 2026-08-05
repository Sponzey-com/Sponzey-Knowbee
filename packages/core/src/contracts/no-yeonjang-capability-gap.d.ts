import { type YeonjangIdentityBoundarySnapshot } from "./yeonjang-identity-boundary.js";
export type RequestedStepExecutionKind = "knowbee_only" | "yeonjang_required";
export interface RequestedCapabilityStep {
    stepId: string;
    summary: string;
    executionKind: RequestedStepExecutionKind;
    requiredCapability?: string;
    requiredCapabilityName?: string;
    userFacingReason?: string;
    userNextAction?: string;
}
export interface NoYeonjangCapabilityGapDecision {
    schemaVersion: 1;
    outcome: "self_solve" | "partial_self_solve" | "guidance_required";
    selfSolveSteps: Array<{
        stepId: string;
        summary: string;
    }>;
    blockedSteps: Array<{
        stepId: string;
        summary: string;
        status: "not_executed";
        requiredCapability: string;
        requiredCapabilityName: string;
        reasonCode: "no_runnable_yeonjang_capability";
        userFacingReason: string;
        userNextAction: string;
    }>;
}
export interface TruthfulNoYeonjangResult {
    schemaVersion: 1;
    status: "completed" | "partial" | "blocked";
    completedSelfSolveResults: Array<{
        stepId: string;
        result: string;
    }>;
    blockedSteps: NoYeonjangCapabilityGapDecision["blockedSteps"];
}
export declare function decideNoYeonjangCapabilityGap(input: {
    steps: RequestedCapabilityStep[];
    snapshot: YeonjangIdentityBoundarySnapshot;
    maxAgeMs: number;
}): NoYeonjangCapabilityGapDecision;
export declare function buildTruthfulNoYeonjangResult(input: {
    decision: NoYeonjangCapabilityGapDecision;
    selfSolveResults: Array<{
        stepId: string;
        result: string;
    }>;
}): TruthfulNoYeonjangResult;
//# sourceMappingURL=no-yeonjang-capability-gap.d.ts.map