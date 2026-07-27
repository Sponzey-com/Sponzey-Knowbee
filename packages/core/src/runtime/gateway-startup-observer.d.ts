import type { GatewayStartupEvidence } from "./gateway-startup-evidence.js";
export interface GatewayStartupProcessSnapshot {
    readonly state: "running" | "exited";
    readonly repositoryOwned: boolean;
    readonly listening: boolean;
}
export interface GatewayStartupProcessPort {
    inspect(pid: number): Promise<GatewayStartupProcessSnapshot>;
}
export type GatewayStartupObserverResult = {
    readonly status: "still_starting";
    readonly state: GatewayStartupEvidence["state"] | "awaiting_evidence" | "verifying_ready";
    readonly elapsedMs: number;
    readonly performance: "within_budget" | "budget_exceeded";
} | {
    readonly status: "ready";
    readonly elapsedMs: number;
} | {
    readonly status: "failed";
    readonly elapsedMs: number;
    readonly reasonCode: string;
} | {
    readonly status: "cancelled";
    readonly elapsedMs: number;
    readonly reasonCode: string;
};
export declare function observeGatewayStartupEvidence(input: {
    readonly evidence: GatewayStartupEvidence | null;
    readonly expectedPid: number;
    readonly minimumStartedAt: number;
    readonly observedAt: number;
    readonly performanceBudgetMs: number;
    readonly processPort: GatewayStartupProcessPort;
}): Promise<GatewayStartupObserverResult>;
//# sourceMappingURL=gateway-startup-observer.d.ts.map