import type { CanonicalTelegramSmokeApprovalReceipt, CanonicalTelegramSmokeArtifactReceipt, CanonicalTelegramSmokeCapabilityReceipt, CanonicalTelegramSmokeToolReceipt } from "../channels/telegram-live-smoke-executor.js";
import type { DbArtifactReceipt, DbAuditLog, DbChannelMessageRef, DbDecisionTrace, DbMessageLedgerEvent } from "../db/index.js";
import type { ApprovalRegistryRow } from "../runs/approval-registry.js";
import type { TelegramLiveSmokeTarget } from "./server-runtime-context.js";
export interface TelegramLiveSmokeEvidenceProjection {
    providerDeliveryReceipted: boolean;
    targetMatched: boolean;
    userReportDelivered: boolean;
    userReportDeliveryCount: number;
    deliveryReceiptRef?: string;
    capabilitySelectionDecisionTraceId?: string;
    toolReceipts: readonly CanonicalTelegramSmokeToolReceipt[];
    approvalReceipts: readonly CanonicalTelegramSmokeApprovalReceipt[];
    artifactReceipts: readonly CanonicalTelegramSmokeArtifactReceipt[];
    capabilityReceipts: readonly CanonicalTelegramSmokeCapabilityReceipt[];
}
export interface TelegramLiveSmokeEvidenceReaderDependencies {
    listMessageLedgerEvents(input: {
        runId: string;
        limit?: number;
    }): readonly DbMessageLedgerEvent[];
    listChannelMessageRefsForRun(runId: string): readonly DbChannelMessageRef[];
    listDecisionTracesForRun?(runId: string): readonly DbDecisionTrace[];
    listAuditLogsForRun?(runId: string): readonly DbAuditLog[];
    getLatestApprovalForRun?(runId: string): ApprovalRegistryRow | undefined;
    listArtifactReceiptsForRun?(runId: string): readonly DbArtifactReceipt[];
}
export declare function createTelegramLiveSmokeEvidenceReader(dependencies: TelegramLiveSmokeEvidenceReaderDependencies): (run: {
    id: string;
    requestGroupId: string;
}, target: TelegramLiveSmokeTarget) => TelegramLiveSmokeEvidenceProjection;
//# sourceMappingURL=telegram-live-smoke-evidence.d.ts.map