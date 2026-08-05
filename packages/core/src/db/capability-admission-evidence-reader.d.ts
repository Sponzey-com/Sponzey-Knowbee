import type Database from "better-sqlite3";
import type { CapabilityAdmissionEvidenceReader } from "../channels/live-smoke-decision-receipts.js";
export declare class SqliteCapabilityAdmissionEvidenceReader implements CapabilityAdmissionEvidenceReader {
    private readonly db;
    constructor(db: Database.Database);
    readForRun(runId: string): string | undefined;
}
//# sourceMappingURL=capability-admission-evidence-reader.d.ts.map