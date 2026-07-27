import type Database from "better-sqlite3";
import { type SideEffectOperationReceipt } from "../contracts/side-effect-operation.js";
import type { SideEffectOperationAggregate, SideEffectOperationRepository } from "../runs/side-effect-operation-use-case.js";
export declare class SqliteSideEffectOperationRepository implements SideEffectOperationRepository {
    private readonly db;
    private readonly now;
    constructor(db: Database.Database, now: () => number);
    loadByScope(scopeId: string): SideEffectOperationAggregate | undefined;
    listByRun(runId: string, limit?: number): SideEffectOperationAggregate[];
    loadReceipt(receiptId: string): SideEffectOperationReceipt | undefined;
    create(aggregate: SideEffectOperationAggregate): {
        created: true;
    } | {
        created: false;
        reasonCode: "scope_conflict";
    };
    saveTransition(input: {
        aggregate: SideEffectOperationAggregate;
        expectedRevision: number;
        receipt: SideEffectOperationReceipt;
    }): {
        saved: true;
    } | {
        saved: false;
        reasonCode: "revision_conflict" | "receipt_conflict" | "receipt_invalid";
        currentRevision: number;
    };
}
//# sourceMappingURL=side-effect-operation-repository.d.ts.map