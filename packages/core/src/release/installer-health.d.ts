export interface InstallerHealthIdentity {
    readonly releaseVersion: string;
    readonly stateDirectoryFingerprint: `sha256:${string}`;
}
export declare function buildInstallerHealthIdentity(input: {
    readonly releaseVersion: string;
    readonly stateDirectory: string;
}): InstallerHealthIdentity;
//# sourceMappingURL=installer-health.d.ts.map