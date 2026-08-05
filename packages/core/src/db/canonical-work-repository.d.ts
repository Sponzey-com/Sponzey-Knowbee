import type Database from "better-sqlite3";
import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import type { CanonicalWorkRepository } from "../runs/canonical-work-transition-use-case.js";
export declare class CanonicalWorkPersistenceCorruptionError extends Error {
    readonly reasonCode = "canonical_work_persistence_corrupt";
    constructor();
}
export declare class SqliteCanonicalWorkRepository implements CanonicalWorkRepository {
    private readonly db;
    private readonly now;
    constructor(db: Database.Database, now: () => number);
    create(aggregate: CanonicalWorkAggregate): {
        created: true;
    } | {
        created: false;
        reasonCode: "already_exists";
    };
    load(workId: string): CanonicalWorkAggregate | undefined;
    listRecoverable(limit?: number): CanonicalWorkAggregate[];
    save(input: {
        aggregate: CanonicalWorkAggregate;
        expectedRevision: number;
    }): {
        saved: true;
    } | {
        saved: false;
        reasonCode: "revision_conflict";
        currentRevision: number;
    };
}
//# sourceMappingURL=canonical-work-repository.d.ts.map