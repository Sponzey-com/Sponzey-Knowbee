import type { ArtifactAccessDescriptor } from "../artifacts/lifecycle.js";
import type { CanonicalWebUiSmokeApprovalReceipt, CanonicalWebUiSmokeArtifactReceipt, CanonicalWebUiSmokeCapabilityReceipt, CanonicalWebUiSmokeToolReceipt } from "../channels/webui-live-smoke-executor.js";
import type { DbArtifactMetadata, DbArtifactReceipt, DbAuditLog, DbMessageLedgerEvent } from "../db/index.js";
import type { ApprovalRegistryRow } from "../runs/approval-registry.js";
export interface WebUiLiveSmokeEvidenceProjection {
    toolReceipts: readonly CanonicalWebUiSmokeToolReceipt[];
    approvalReceipts: readonly CanonicalWebUiSmokeApprovalReceipt[];
    artifactReceipts: readonly CanonicalWebUiSmokeArtifactReceipt[];
    capabilityReceipts: readonly CanonicalWebUiSmokeCapabilityReceipt[];
    userReportDelivered: boolean;
    userReportDeliveryCount: number;
    deliveryReceiptRef?: string;
}
export interface WebUiLiveSmokeEvidenceReaderDependencies {
    listAuditLogsForRun(runId: string): readonly DbAuditLog[];
    getLatestApprovalForRun(runId: string): ApprovalRegistryRow | undefined;
    listArtifactReceiptsForRun(runId: string): readonly DbArtifactReceipt[];
    listArtifactMetadataForRun(runId: string): readonly DbArtifactMetadata[];
    listMessageLedgerEvents(input: {
        runId: string;
        limit?: number;
    }): readonly DbMessageLedgerEvent[];
    buildArtifactAccess(metadata: DbArtifactMetadata): ArtifactAccessDescriptor;
    isWebUiApprovalVisible(): boolean;
}
export declare function createWebUiLiveSmokeEvidenceReader(dependencies: WebUiLiveSmokeEvidenceReaderDependencies): (run: {
    id: string;
    requestGroupId: string;
}) => WebUiLiveSmokeEvidenceProjection;
//# sourceMappingURL=webui-live-smoke-evidence.d.ts.map