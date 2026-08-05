import type { BackupSnapshotManifest, SnapshotVerificationResult } from "../config/backup-rehearsal.js";
import { type BackupRestoreRehearsalReceipt } from "./backup-restore-receipt.js";
import { type NpmCleanInstallReceipt, type StagedNpmPackageDigest } from "./npm-install-receipt.js";
export interface ReleaseCandidateIdentity {
    appVersion: string;
    gitTag: string | null;
    gitCommit: string | null;
}
export type ArtifactCleanupSmokeCheck = "preview" | "confirmation_failure" | "destructive_fixture_success";
export interface ArtifactCleanupSmokeReceipt {
    kind: "knowbee.artifact_cleanup_cli_smoke";
    status: "passed";
    checked: readonly ArtifactCleanupSmokeCheck[];
}
export interface OperationalRehearsalEvidenceInput {
    candidate: Readonly<ReleaseCandidateIdentity>;
    npmReceipt: Readonly<NpmCleanInstallReceipt> | unknown | null;
    stagedPackages: readonly StagedNpmPackageDigest[];
    backupReceipt: Readonly<BackupRestoreRehearsalReceipt> | unknown | null;
    backupManifest: Readonly<BackupSnapshotManifest> | unknown | null;
    snapshotVerification: Readonly<SnapshotVerificationResult>;
    artifactCleanupSmokeReceipt: Readonly<ArtifactCleanupSmokeReceipt> | unknown | null;
}
export interface OperationalRehearsalEvidenceSummary {
    kind: "knowbee.release.operational_rehearsal_evidence";
    schemaVersion: 1;
    status: "passed" | "failed";
    reasonCodes: readonly string[];
    npmInstall: {
        status: "verified" | "missing" | "rejected";
        reasonCode: string | null;
        packageVersion: string | null;
        packageSetDigestSha256: string | null;
    };
    backupRestore: {
        status: "verified" | "missing" | "rejected";
        reasonCode: string | null;
        snapshotId: string | null;
        snapshotChecksum: string | null;
        schemaVersion: number | null;
    };
    artifactCleanupSmoke: {
        status: "verified" | "missing" | "rejected";
        reasonCode: string | null;
        checked: readonly ArtifactCleanupSmokeCheck[];
        destructiveFixtureVerified: boolean;
    };
}
export declare function verifyOperationalRehearsalEvidence(input: OperationalRehearsalEvidenceInput): OperationalRehearsalEvidenceSummary;
//# sourceMappingURL=operational-rehearsal-evidence.d.ts.map