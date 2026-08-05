import type { GatewayStartupEvent, GatewayStartupSnapshot, GatewayStartupTransitionRejectionReason } from "../contracts/gateway-startup-state.js";
import { type Logger } from "../logger/index.js";
import { type StartupEvidencePort } from "./gateway-startup-evidence.js";
export type GatewayStartupProgressAdvanceResult = {
    readonly status: "advanced";
    readonly evidence: "stored" | "unavailable";
    readonly snapshot: GatewayStartupSnapshot;
} | {
    readonly status: "rejected";
    readonly reasonCode: "startup_identity_mismatch" | GatewayStartupTransitionRejectionReason;
};
export interface GatewayStartupProgressPort {
    readonly startupId: string;
    readonly pid: number;
    getSnapshot(): GatewayStartupSnapshot;
    advance(event: GatewayStartupEvent): Promise<GatewayStartupProgressAdvanceResult>;
}
export interface GatewayStartupProductLogEvent {
    readonly event: "started" | "ready" | "failed" | "cancelled";
    readonly startupId: string;
    readonly elapsedMs: number;
    readonly reasonCode: string | null;
}
export interface GatewayStartupFieldDebugLogEvent {
    readonly event: "evidence_unavailable";
    readonly startupId: string;
    readonly state: GatewayStartupSnapshot["state"];
    readonly reasonCode: string;
}
export interface GatewayStartupLogPort {
    product(event: GatewayStartupProductLogEvent): void;
    fieldDebug(event: GatewayStartupFieldDebugLogEvent): void;
}
export declare function createGatewayStartupLogPort(sink?: Pick<Logger, "product" | "fieldDebug">): GatewayStartupLogPort;
export type StartGatewayStartupResult = {
    readonly status: "started";
    readonly evidence: "stored" | "unavailable";
    readonly progress: GatewayStartupProgressPort;
} | {
    readonly status: "rejected";
    readonly reasonCode: GatewayStartupTransitionRejectionReason;
};
export declare function startGatewayStartup(input: {
    readonly startupId: string;
    readonly pid: number;
    readonly startedAt: number;
    readonly evidencePort: StartupEvidencePort;
    readonly logger?: GatewayStartupLogPort;
}): Promise<StartGatewayStartupResult>;
//# sourceMappingURL=gateway-startup-coordinator.d.ts.map