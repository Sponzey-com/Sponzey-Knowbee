import { type GatewayStartupEvent, type GatewayStartupSnapshot, type GatewayStartupState, type GatewayStartupTransitionRejectionReason } from "../contracts/gateway-startup-state.js";
export declare const GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION: 1;
export interface GatewayStartupEvidence {
    readonly schemaVersion: typeof GATEWAY_STARTUP_EVIDENCE_SCHEMA_VERSION;
    readonly startupId: string;
    readonly pid: number;
    readonly state: GatewayStartupState;
    readonly startedAt: number;
    readonly changedAt: number;
    readonly reasonCode: string | null;
}
export interface StartupEvidencePort {
    readCurrent(): Promise<GatewayStartupEvidence | null>;
    replaceCurrent(evidence: GatewayStartupEvidence): Promise<void>;
}
export interface StartupEvidenceFileSystem {
    makeDirectory(path: string, mode: number): void;
    readText(path: string): string;
    writeText(path: string, content: string, mode: number): void;
    setMode(path: string, mode: number): void;
    rename(from: string, to: string): void;
    remove(path: string): void;
}
export type StoreGatewayStartupEvidenceResult = {
    readonly status: "stored";
    readonly evidence: GatewayStartupEvidence;
} | {
    readonly status: "rejected";
    readonly reasonCode: "startup_identity_mismatch" | "stale_startup" | GatewayStartupTransitionRejectionReason;
} | {
    readonly status: "failed";
    readonly reasonCode: "evidence_store_unavailable";
};
export declare function projectGatewayStartupEvidence(snapshot: GatewayStartupSnapshot): GatewayStartupEvidence;
export declare function createStartupEvidenceFilePort(input: {
    readonly filePath: string;
    readonly fileSystem?: StartupEvidenceFileSystem;
}): StartupEvidencePort;
export declare function initializeGatewayStartupEvidence(input: {
    readonly port: StartupEvidencePort;
    readonly snapshot: GatewayStartupSnapshot;
}): Promise<StoreGatewayStartupEvidenceResult>;
export declare function advanceGatewayStartupEvidence(input: {
    readonly port: StartupEvidencePort;
    readonly startupId: string;
    readonly pid: number;
    readonly event: GatewayStartupEvent;
}): Promise<StoreGatewayStartupEvidenceResult>;
//# sourceMappingURL=gateway-startup-evidence.d.ts.map