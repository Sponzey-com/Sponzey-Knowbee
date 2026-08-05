import type Database from "better-sqlite3";
import type { LivePerformanceEvidenceReadResult, LivePerformanceEvidenceSource } from "./live-performance-evidence.js";
export declare class SqliteLivePerformanceEvidenceSource implements LivePerformanceEvidenceSource {
    private readonly database;
    constructor(database: Database.Database);
    read(runId: string): LivePerformanceEvidenceReadResult;
}
//# sourceMappingURL=sqlite-live-performance-evidence-source.d.ts.map