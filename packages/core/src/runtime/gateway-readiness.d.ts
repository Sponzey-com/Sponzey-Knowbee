import { type GatewayStartupEvent, type GatewayStartupSnapshot, type GatewayStartupTransitionRejectionReason } from "../contracts/gateway-startup-state.js";
export type GatewayReadinessStatus = "starting" | "ready" | "failed";
export interface GatewayReadinessSnapshot {
    readonly status: GatewayReadinessStatus;
    readonly changedAt: string;
    readonly reasonCode: string | null;
}
export type GatewayReadinessTransitionResult = {
    readonly status: "accepted";
    readonly readiness: GatewayReadinessSnapshot;
    readonly startup: GatewayStartupSnapshot;
} | {
    readonly status: "rejected";
    readonly reasonCode: GatewayStartupTransitionRejectionReason;
    readonly readiness: GatewayReadinessSnapshot;
};
export declare function beginGatewayStartup(input: {
    readonly startupId: string;
    readonly pid: number;
    readonly startedAt: number;
}): GatewayReadinessTransitionResult;
export declare function markGatewayStarting(): GatewayReadinessSnapshot;
export declare function transitionGatewayReadiness(event: GatewayStartupEvent): GatewayReadinessTransitionResult;
export declare function markGatewayReady(): GatewayReadinessTransitionResult;
export declare function markGatewayFailed(reasonCode: string): GatewayReadinessTransitionResult;
export declare function getGatewayReadinessSnapshot(): GatewayReadinessSnapshot;
export declare function getGatewayStartupSnapshot(): GatewayStartupSnapshot;
//# sourceMappingURL=gateway-readiness.d.ts.map