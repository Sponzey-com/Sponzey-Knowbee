import type Database from "better-sqlite3";
import type { ReleasePolicyAuthorizationBinding, ReleasePolicyAuthorizationRecord, ReleasePolicyAuthorizationRepository } from "./release-policy-authorization.js";
export declare class SqliteReleasePolicyAuthorizationRepository implements ReleasePolicyAuthorizationRepository {
    private readonly db;
    constructor(db: Database.Database);
    append(record: Readonly<ReleasePolicyAuthorizationRecord>): {
        status: "stored" | "duplicate_id";
    };
    findLatest(binding: Readonly<ReleasePolicyAuthorizationBinding>): Readonly<ReleasePolicyAuthorizationRecord> | undefined;
}
//# sourceMappingURL=sqlite-release-policy-authorization-repository.d.ts.map