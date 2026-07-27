import type Database from "better-sqlite3";
import { type CanonicalWorkReceipt, type CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js";
export declare class CanonicalWorkReceiptPersistenceError extends Error {
    readonly reasonCode = "canonical_work_receipt_persistence_corrupt";
    constructor();
}
export declare class SqliteCanonicalWorkReceiptRepository {
    private readonly db;
    private readonly now;
    constructor(db: Database.Database, now: () => number);
    issue(input: Omit<CanonicalWorkReceipt, "issuedAt" | "consumedRevision">): {
        issued: true;
    } | {
        issued: false;
        reasonCode: "receipt_invalid" | "receipt_already_exists";
    };
    load(receiptId: string): CanonicalWorkReceipt | undefined;
    findLatestConsumedByKind(workId: string, kind: CanonicalWorkReceiptKind): CanonicalWorkReceipt | undefined;
    consume(input: {
        receiptId: string;
        workId: string;
        revision: number;
    }): {
        consumed: true;
    } | {
        consumed: false;
        reasonCode: "receipt_not_found" | "receipt_scope_mismatch" | "receipt_already_consumed";
    };
}
//# sourceMappingURL=canonical-work-receipt-repository.d.ts.map