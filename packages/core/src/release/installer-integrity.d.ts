import { type InstallerArtifact, type UnsignedInstallerManifestV2 } from "./installer-contract.js";
export type InstallerArtifactIntegrityResult = {
    readonly status: "verified";
    readonly target: InstallerArtifact["target"];
    readonly sizeBytes: number;
    readonly sha256: string;
} | {
    readonly status: "rejected";
    readonly reasonCode: "artifact_size_mismatch" | "artifact_digest_mismatch";
};
export type UnsignedInstallerManifestVerificationResult = {
    readonly status: "verified";
    readonly manifest: UnsignedInstallerManifestV2;
    readonly manifestSha256: `sha256:${string}`;
    readonly originTrust: "unsigned_origin_unverified";
} | {
    readonly status: "rejected";
    readonly reasonCode: "manifest_invalid" | "schema_version_unsupported" | "node_version_unsupported" | `artifact_target_missing:${InstallerArtifact["target"]}` | `artifact_target_duplicate:${InstallerArtifact["target"]}` | `artifact_abi_mismatch:${InstallerArtifact["target"]}` | "manifest_bytes_invalid";
};
/** Validates v2 structure only; artifact hashes do not authenticate the manifest publisher. */
export declare function verifyUnsignedInstallerManifest(input: {
    readonly rawManifestBytes: Uint8Array;
}): UnsignedInstallerManifestVerificationResult;
export declare function verifyInstallerArtifactBytes(input: {
    readonly artifact: InstallerArtifact;
    readonly bytes: Uint8Array;
}): InstallerArtifactIntegrityResult;
//# sourceMappingURL=installer-integrity.d.ts.map