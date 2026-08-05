import { verifyBackupRestoreRehearsalReceipt, } from "./backup-restore-receipt.js";
import { verifyNpmCleanInstallReceipt, } from "./npm-install-receipt.js";
const ARTIFACT_CLEANUP_REQUIRED_CHECKS = [
    "preview",
    "confirmation_failure",
];
const ARTIFACT_CLEANUP_ALLOWED_CHECKS = new Set([
    "preview",
    "confirmation_failure",
    "destructive_fixture_success",
]);
function verifyArtifactCleanupSmokeReceipt(receipt) {
    if (receipt === null || receipt === undefined) {
        const reasonCode = "artifact_cleanup_smoke_receipt_missing";
        return {
            reasonCode,
            summary: {
                status: "missing",
                reasonCode,
                checked: [],
                destructiveFixtureVerified: false,
            },
        };
    }
    const candidate = receipt;
    if (candidate.kind !== "knowbee.artifact_cleanup_cli_smoke") {
        const reasonCode = "artifact_cleanup_smoke_kind_invalid";
        return {
            reasonCode,
            summary: {
                status: "rejected",
                reasonCode: `artifact_cleanup_smoke:${reasonCode}`,
                checked: [],
                destructiveFixtureVerified: false,
            },
        };
    }
    if (candidate.status !== "passed") {
        const reasonCode = "artifact_cleanup_smoke_status_invalid";
        return {
            reasonCode,
            summary: {
                status: "rejected",
                reasonCode: `artifact_cleanup_smoke:${reasonCode}`,
                checked: [],
                destructiveFixtureVerified: false,
            },
        };
    }
    if (!Array.isArray(candidate.checked)) {
        const reasonCode = "artifact_cleanup_smoke_checked_invalid";
        return {
            reasonCode,
            summary: {
                status: "rejected",
                reasonCode: `artifact_cleanup_smoke:${reasonCode}`,
                checked: [],
                destructiveFixtureVerified: false,
            },
        };
    }
    const checked = [...new Set(candidate.checked)];
    if (checked.length !== candidate.checked.length ||
        checked.some((value) => !ARTIFACT_CLEANUP_ALLOWED_CHECKS.has(value))) {
        const reasonCode = "artifact_cleanup_smoke_checked_invalid";
        return {
            reasonCode,
            summary: {
                status: "rejected",
                reasonCode: `artifact_cleanup_smoke:${reasonCode}`,
                checked: [],
                destructiveFixtureVerified: false,
            },
        };
    }
    for (const required of ARTIFACT_CLEANUP_REQUIRED_CHECKS) {
        if (!checked.includes(required)) {
            const reasonCode = `artifact_cleanup_smoke_required_check_missing:${required}`;
            return {
                reasonCode,
                summary: {
                    status: "rejected",
                    reasonCode: `artifact_cleanup_smoke:${reasonCode}`,
                    checked: Object.freeze(checked),
                    destructiveFixtureVerified: checked.includes("destructive_fixture_success"),
                },
            };
        }
    }
    return {
        reasonCode: null,
        summary: {
            status: "verified",
            reasonCode: null,
            checked: Object.freeze(checked),
            destructiveFixtureVerified: checked.includes("destructive_fixture_success"),
        },
    };
}
export function verifyOperationalRehearsalEvidence(input) {
    const reasonCodes = [];
    let npmInstall;
    if (input.npmReceipt === null || input.npmReceipt === undefined) {
        const reasonCode = "npm_install_receipt_missing";
        reasonCodes.push(reasonCode);
        npmInstall = {
            status: "missing",
            reasonCode,
            packageVersion: null,
            packageSetDigestSha256: null,
        };
    }
    else {
        const verification = verifyNpmCleanInstallReceipt({
            receipt: input.npmReceipt,
            packages: input.stagedPackages,
        });
        if (verification.status === "rejected") {
            const reasonCode = `npm_install:${verification.reasonCode}`;
            reasonCodes.push(reasonCode);
            npmInstall = {
                status: "rejected",
                reasonCode,
                packageVersion: null,
                packageSetDigestSha256: null,
            };
        }
        else {
            const receipt = input.npmReceipt;
            if (receipt.packageVersion !== input.candidate.appVersion) {
                const reasonCode = "npm_install_candidate_version_mismatch";
                reasonCodes.push(reasonCode);
                npmInstall = {
                    status: "rejected",
                    reasonCode,
                    packageVersion: receipt.packageVersion,
                    packageSetDigestSha256: receipt.packageSetDigestSha256,
                };
            }
            else {
                npmInstall = {
                    status: "verified",
                    reasonCode: null,
                    packageVersion: receipt.packageVersion,
                    packageSetDigestSha256: receipt.packageSetDigestSha256,
                };
            }
        }
    }
    let backupRestore;
    if (input.backupReceipt === null || input.backupReceipt === undefined) {
        const reasonCode = "backup_restore_receipt_missing";
        reasonCodes.push(reasonCode);
        backupRestore = {
            status: "missing",
            reasonCode,
            snapshotId: null,
            snapshotChecksum: null,
            schemaVersion: null,
        };
    }
    else if (input.backupManifest === null || input.backupManifest === undefined) {
        const reasonCode = "backup_snapshot_manifest_missing";
        reasonCodes.push(reasonCode);
        backupRestore = {
            status: "missing",
            reasonCode,
            snapshotId: null,
            snapshotChecksum: null,
            schemaVersion: null,
        };
    }
    else {
        const verification = verifyBackupRestoreRehearsalReceipt({
            receipt: input.backupReceipt,
            manifest: input.backupManifest,
            snapshotVerification: input.snapshotVerification,
        });
        if (verification.status === "rejected") {
            const reasonCode = `backup_restore:${verification.reasonCode}`;
            reasonCodes.push(reasonCode);
            backupRestore = {
                status: "rejected",
                reasonCode,
                snapshotId: null,
                snapshotChecksum: null,
                schemaVersion: null,
            };
        }
        else {
            const receipt = input.backupReceipt;
            if (receipt.snapshot.appVersion !== input.candidate.appVersion ||
                receipt.snapshot.gitTag !== input.candidate.gitTag ||
                receipt.snapshot.gitCommit !== input.candidate.gitCommit) {
                const reasonCode = "backup_restore_candidate_identity_mismatch";
                reasonCodes.push(reasonCode);
                backupRestore = {
                    status: "rejected",
                    reasonCode,
                    snapshotId: receipt.snapshot.id,
                    snapshotChecksum: receipt.snapshot.checksum,
                    schemaVersion: receipt.snapshot.schemaVersion,
                };
            }
            else {
                backupRestore = {
                    status: "verified",
                    reasonCode: null,
                    snapshotId: receipt.snapshot.id,
                    snapshotChecksum: receipt.snapshot.checksum,
                    schemaVersion: receipt.snapshot.schemaVersion,
                };
            }
        }
    }
    const artifactCleanupSmoke = verifyArtifactCleanupSmokeReceipt(input.artifactCleanupSmokeReceipt);
    if (artifactCleanupSmoke.reasonCode) {
        reasonCodes.push(artifactCleanupSmoke.summary.reasonCode ?? artifactCleanupSmoke.reasonCode);
    }
    return Object.freeze({
        kind: "knowbee.release.operational_rehearsal_evidence",
        schemaVersion: 1,
        status: reasonCodes.length === 0 ? "passed" : "failed",
        reasonCodes: Object.freeze(reasonCodes),
        npmInstall: Object.freeze(npmInstall),
        backupRestore: Object.freeze(backupRestore),
        artifactCleanupSmoke: Object.freeze(artifactCleanupSmoke.summary),
    });
}
//# sourceMappingURL=operational-rehearsal-evidence.js.map