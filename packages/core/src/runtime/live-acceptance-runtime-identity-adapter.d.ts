import { type LiveAcceptanceRuntimeIdentityAdmission } from "../release/live-acceptance-runtime-identity.js";
import { type RuntimeBuildStatus } from "./build-status.js";
export interface LiveAcceptanceRuntimeIdentityAdapterInput {
    readonly workspaceRoot?: string;
    readonly processStartTimeMs?: number;
    readonly readBuildStatus?: () => RuntimeBuildStatus;
    readonly readText?: (path: string) => string;
    readonly readBytes?: (path: string) => Uint8Array;
    readonly readMtimeMs?: (path: string) => number;
}
export declare function createLiveAcceptanceRuntimeIdentityInspector(input?: LiveAcceptanceRuntimeIdentityAdapterInput): () => LiveAcceptanceRuntimeIdentityAdmission;
//# sourceMappingURL=live-acceptance-runtime-identity-adapter.d.ts.map