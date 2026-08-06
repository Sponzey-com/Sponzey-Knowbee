export type InstallerTransactionPhase = "preflight" | "preflight_passed" | "downloaded" | "verified" | "staged" | "activated" | "service_registered" | "service_skipped" | "healthy" | "health_skipped" | "committed" | "failed" | "rolling_back" | "rolled_back" | "cancelled";
export type InstallerEvidenceKind = "preflight" | "download" | "verification" | "stage" | "activation" | "service" | "service_policy" | "health" | "health_policy" | "commit" | "rollback";
export interface InstallerTransactionEvidence {
    readonly kind: InstallerEvidenceKind;
    readonly receiptRef: string;
}
export interface InstallerTransactionFailure {
    readonly reasonCode: string;
    readonly recovery: "cleanup" | "rollback";
}
interface InstallerTransactionBase {
    readonly kind: "knowbee.installer.transaction";
    readonly schemaVersion: 1;
    readonly operationId: string;
    readonly idempotencyKey: string;
    readonly targetFingerprint: `sha256:${string}`;
    readonly desiredVersion: string;
    readonly previousReleaseId: string | null;
    readonly revision: number;
    readonly appliedEventIds: readonly string[];
    readonly evidence: readonly InstallerTransactionEvidence[];
}
export interface InstallerTransactionNormalState extends InstallerTransactionBase {
    readonly phase: Exclude<InstallerTransactionPhase, "failed" | "rolling_back" | "rolled_back">;
    readonly failure: null;
}
export interface InstallerTransactionRecoveryState extends InstallerTransactionBase {
    readonly phase: "failed" | "rolling_back" | "rolled_back";
    readonly failure: InstallerTransactionFailure;
}
export type InstallerTransactionState = InstallerTransactionNormalState | InstallerTransactionRecoveryState;
interface InstallerTransactionEventBase {
    readonly eventId: string;
    readonly operationId: string;
    readonly targetFingerprint: string;
    readonly expectedRevision: number;
}
type ReceiptEventType = "preflight_passed" | "bundle_downloaded" | "bundle_verified" | "stage_prepared" | "service_registered" | "service_skipped" | "health_verified" | "health_skipped" | "commit_completed" | "rollback_completed";
export type InstallerTransactionEvent = (InstallerTransactionEventBase & {
    readonly type: ReceiptEventType;
    readonly receiptRef: string;
}) | (InstallerTransactionEventBase & {
    readonly type: "activation_completed";
    readonly receiptRef: string;
    readonly previousReleaseId: string | null;
}) | (InstallerTransactionEventBase & {
    readonly type: "failure_recorded";
    readonly reasonCode: string;
}) | (InstallerTransactionEventBase & {
    readonly type: "rollback_started";
}) | (InstallerTransactionEventBase & {
    readonly type: "cancelled";
});
export type InstallerTransactionReduceResult = {
    readonly status: "applied";
    readonly state: InstallerTransactionState;
} | {
    readonly status: "rejected";
    readonly reasonCode: string;
};
export type InstallerTransactionRecoveryAction = {
    readonly action: "resume";
} | {
    readonly action: "discard_stage_and_resume";
} | {
    readonly action: "resume_commit";
} | {
    readonly action: "resume_policy_commit";
} | {
    readonly action: "cleanup";
} | {
    readonly action: "rollback";
    readonly previousReleaseId: string | null;
} | {
    readonly action: "none";
    readonly reasonCode: "terminal";
};
export declare function startInstallerTransaction(input: {
    readonly operationId: string;
    readonly idempotencyKey: string;
    readonly targetFingerprint: string;
    readonly desiredVersion: string;
}): InstallerTransactionState;
export declare function reduceInstallerTransaction(state: InstallerTransactionState, event: InstallerTransactionEvent): InstallerTransactionReduceResult;
export declare function recoverInstallerTransaction(state: InstallerTransactionState): InstallerTransactionRecoveryAction;
export type InstallerTransactionSnapshotParseResult = {
    readonly status: "accepted";
    readonly state: InstallerTransactionState;
} | {
    readonly status: "rejected";
    readonly reasonCode: "installer_snapshot_invalid";
};
export declare function parseInstallerTransactionSnapshot(value: unknown): InstallerTransactionSnapshotParseResult;
export {};
//# sourceMappingURL=installer-transaction.d.ts.map