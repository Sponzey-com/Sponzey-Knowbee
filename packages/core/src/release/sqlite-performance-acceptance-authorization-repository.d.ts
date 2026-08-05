import type Database from "better-sqlite3";
import type { PerformanceAcceptanceAuthorizationBinding, PerformanceAcceptanceAuthorizationRecord, PerformanceAcceptanceAuthorizationRepository } from "./performance-acceptance-authorization.js";
export declare class SqlitePerformanceAcceptanceAuthorizationRepository implements PerformanceAcceptanceAuthorizationRepository {
    private readonly db;
    constructor(db: Database.Database);
    append(record: Readonly<PerformanceAcceptanceAuthorizationRecord>): {
        status: "stored" | "duplicate_id";
    };
    findLatest(binding: Readonly<PerformanceAcceptanceAuthorizationBinding>): Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined;
}
//# sourceMappingURL=sqlite-performance-acceptance-authorization-repository.d.ts.map