import type { BackupSnapshotManifest, RestoreRehearsalCheckName, RestoreRehearsalReport, SnapshotVerificationResult } from "../config/backup-rehearsal.js";
export declare const REQUIRED_RESTORE_REHEARSAL_CHECKS: readonly RestoreRehearsalCheckName[];
export interface BackupRestoreRehearsalReceipt {
    kind: "knowbee.release.backup_restore_rehearsal_receipt";
    schemaVersion: 1;
    status: "passed";
    issuedAt: number;
    snapshot: {
        id: string;
        checksum: string;
        appVersion: string;
        gitTag: string | null;
        gitCommit: string | null;
        schemaVersion: number;
        latestSchemaVersion: number;
    };
    restore: {
        checkCount: 5;
        checks: readonly RestoreRehearsalCheckName[];
        restoredFileCount: number;
        promptSourceCount: number;
        migration: {
            currentVersion: number;
            latestVersion: number;
            upToDate: true;
        };
    };
}
export type BackupRestoreReceiptBuildResult = {
    status: "ready";
    receipt: Readonly<BackupRestoreRehearsalReceipt>;
} | {
    status: "rejected";
    reasonCode: string;
};
export type BackupRestoreReceiptVerificationResult = {
    status: "verified";
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function buildBackupRestoreRehearsalReceipt(input: {
    manifest: Readonly<BackupSnapshotManifest>;
    snapshotVerification: Readonly<SnapshotVerificationResult>;
    report: Readonly<RestoreRehearsalReport>;
    issuedAt: number;
}): BackupRestoreReceiptBuildResult;
export declare function verifyBackupRestoreRehearsalReceipt(input: {
    receipt: unknown;
    manifest: unknown;
    snapshotVerification: Readonly<SnapshotVerificationResult>;
}): BackupRestoreReceiptVerificationResult;
//# sourceMappingURL=backup-restore-receipt.d.ts.map