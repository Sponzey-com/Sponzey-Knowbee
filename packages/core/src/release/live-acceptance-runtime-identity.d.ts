export interface LiveAcceptanceRuntimeIdentitySnapshot {
    readonly buildId: string;
    readonly bundleSha256: string;
    readonly processStartedAt: string;
    readonly artifactBuiltAt: string;
    readonly buildRequired: boolean;
    readonly restartRequired: boolean;
    readonly manifestMatchesArtifact: boolean;
    readonly activeBundleMatchesArtifact: boolean;
}
export interface LiveAcceptanceRuntimeIdentityReceipt {
    readonly buildId: string;
    readonly bundleSha256: `sha256:${string}`;
    readonly processStartedAt: string;
    readonly artifactBuiltAt: string;
    readonly buildRequired: false;
    readonly restartRequired: false;
}
export type LiveAcceptanceRuntimeIdentityAdmission = Readonly<{
    status: "verified";
    receipt: Readonly<LiveAcceptanceRuntimeIdentityReceipt>;
}> | Readonly<{
    status: "blocked";
    reasonCode: "live_acceptance_runtime_build_required" | "live_acceptance_runtime_restart_required" | "live_acceptance_runtime_bundle_identity_mismatch" | "live_acceptance_runtime_identity_invalid";
}>;
export declare function admitLiveAcceptanceRuntimeIdentity(snapshot: Readonly<LiveAcceptanceRuntimeIdentitySnapshot>): LiveAcceptanceRuntimeIdentityAdmission;
//# sourceMappingURL=live-acceptance-runtime-identity.d.ts.map