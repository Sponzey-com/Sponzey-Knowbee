export declare const REQUIRED_NPM_RELEASE_PACKAGE_NAMES: readonly ["@sponzey/cli", "@sponzey/core", "@sponzey/knowbee", "@sponzey/webui"];
export interface StagedNpmPackageDigest {
    name: string;
    version: string;
    digestSha256: string;
}
export interface NpmCleanInstallRuntimeIdentity {
    nodeVersion: string;
    npmVersion: string;
    platform: string;
    arch: string;
}
export interface NpmCleanInstallReceipt {
    kind: "knowbee.release.npm_clean_install_receipt";
    schemaVersion: 1;
    status: "passed";
    issuedAt: number;
    packageVersion: string;
    packageCount: 4;
    packages: readonly StagedNpmPackageDigest[];
    packageSetDigestSha256: string;
    runtime: Readonly<NpmCleanInstallRuntimeIdentity>;
    installMode: "local_tarballs";
    cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js";
    cliContract: "help_usage_verified";
}
export type NpmInstallReceiptBuildResult = {
    status: "ready";
    receipt: Readonly<NpmCleanInstallReceipt>;
} | {
    status: "rejected";
    reasonCode: string;
};
export type NpmInstallReceiptVerificationResult = {
    status: "verified";
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function buildNpmCleanInstallReceipt(input: {
    packages: readonly StagedNpmPackageDigest[];
    runtime: Readonly<NpmCleanInstallRuntimeIdentity>;
    issuedAt: number;
    cliHelpVerified: boolean;
}): NpmInstallReceiptBuildResult;
export declare function verifyNpmCleanInstallReceipt(input: {
    receipt: unknown;
    packages: readonly StagedNpmPackageDigest[];
}): NpmInstallReceiptVerificationResult;
//# sourceMappingURL=npm-install-receipt.d.ts.map