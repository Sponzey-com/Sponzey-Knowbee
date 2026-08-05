import { validateCanonicalWorkReceipt, } from "../contracts/canonical-work-receipt.js";
export class CanonicalWorkReceiptPersistenceError extends Error {
    reasonCode = "canonical_work_receipt_persistence_corrupt";
    constructor() { super("Canonical work receipt persistence is corrupt."); this.name = "CanonicalWorkReceiptPersistenceError"; }
}
function parse(row) {
    let refs;
    try {
        refs = JSON.parse(row.evidence_refs_json);
    }
    catch {
        throw new CanonicalWorkReceiptPersistenceError();
    }
    if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string"))
        throw new CanonicalWorkReceiptPersistenceError();
    let terminalCause;
    if (row.terminal_cause_json !== null) {
        try {
            terminalCause = JSON.parse(row.terminal_cause_json);
        }
        catch {
            throw new CanonicalWorkReceiptPersistenceError();
        }
    }
    const receipt = { receiptId: row.receipt_id, workId: row.work_id, kind: row.kind, evidenceFingerprint: row.evidence_fingerprint, evidenceRefs: refs, issuedAt: row.issued_at, ...(row.consumed_revision !== null ? { consumedRevision: row.consumed_revision } : {}), ...(terminalCause ? { terminalCause } : {}) };
    if (!validateCanonicalWorkReceipt(receipt).ok)
        throw new CanonicalWorkReceiptPersistenceError();
    return receipt;
}
export class SqliteCanonicalWorkReceiptRepository {
    db;
    now;
    constructor(db, now) {
        this.db = db;
        this.now = now;
    }
    issue(input) {
        const receipt = { ...input, issuedAt: this.now() };
        if (!validateCanonicalWorkReceipt(receipt).ok)
            return { issued: false, reasonCode: "receipt_invalid" };
        const result = this.db.prepare(`INSERT OR IGNORE INTO canonical_work_receipts (receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at, consumed_revision, terminal_cause_json) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`).run(receipt.receiptId, receipt.workId, receipt.kind, receipt.evidenceFingerprint, JSON.stringify(receipt.evidenceRefs), receipt.issuedAt, receipt.terminalCause ? JSON.stringify(receipt.terminalCause) : null);
        return result.changes === 1 ? { issued: true } : { issued: false, reasonCode: "receipt_already_exists" };
    }
    load(receiptId) {
        const row = this.db.prepare(`SELECT receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at, consumed_revision, terminal_cause_json FROM canonical_work_receipts WHERE receipt_id = ?`).get(receiptId);
        return row ? parse(row) : undefined;
    }
    findLatestConsumedByKind(workId, kind) {
        const row = this.db
            .prepare(`
        SELECT receipt_id, work_id, kind, evidence_fingerprint, evidence_refs_json, issued_at,
               consumed_revision, terminal_cause_json
        FROM canonical_work_receipts
        WHERE work_id = ? AND kind = ? AND consumed_revision IS NOT NULL
        ORDER BY consumed_revision DESC, issued_at DESC
        LIMIT 1
      `)
            .get(workId, kind);
        return row ? parse(row) : undefined;
    }
    consume(input) {
        const result = this.db.prepare(`UPDATE canonical_work_receipts SET consumed_revision = ? WHERE receipt_id = ? AND work_id = ? AND consumed_revision IS NULL`).run(input.revision, input.receiptId, input.workId);
        if (result.changes === 1)
            return { consumed: true };
        const current = this.load(input.receiptId);
        if (!current)
            return { consumed: false, reasonCode: "receipt_not_found" };
        if (current.workId !== input.workId)
            return { consumed: false, reasonCode: "receipt_scope_mismatch" };
        return { consumed: false, reasonCode: "receipt_already_consumed" };
    }
}
//# sourceMappingURL=canonical-work-receipt-repository.js.map