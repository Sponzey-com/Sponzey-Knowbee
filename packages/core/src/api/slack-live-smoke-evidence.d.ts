import type { DbChannelMessageRef, DbMessageLedgerEvent } from "../db/index.js";
import type { SlackLiveSmokeTarget } from "./server-runtime-context.js";
export interface SlackLiveSmokeEvidenceProjection {
    providerDeliveryReceipted: boolean;
    targetMatched: boolean;
    userReportDelivered: boolean;
}
export interface SlackLiveSmokeEvidenceReaderDependencies {
    listMessageLedgerEvents(input: {
        runId: string;
        limit?: number;
    }): readonly DbMessageLedgerEvent[];
    listChannelMessageRefsForRun(runId: string): readonly DbChannelMessageRef[];
}
export declare function createSlackLiveSmokeEvidenceReader(dependencies: SlackLiveSmokeEvidenceReaderDependencies): (run: {
    id: string;
    requestGroupId: string;
}, target: SlackLiveSmokeTarget) => SlackLiveSmokeEvidenceProjection;
//# sourceMappingURL=slack-live-smoke-evidence.d.ts.map