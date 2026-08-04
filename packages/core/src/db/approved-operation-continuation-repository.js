import { approvedOperationContinuationId, } from "../runs/approved-operation-continuation.js";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
export class SqliteApprovedOperationContinuationRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    enqueue(command, now = Date.now()) {
        const source = this.db.prepare(`SELECT id, run_id, request_group_id, tool_name, status, operation_id,
              operation_binding_hash, continuation_schema_version
       FROM approval_registry WHERE id = ?`).get(command.approvalId);
        if (!source
            || source.status !== "consumed"
            || source.run_id !== command.runId
            || source.request_group_id !== command.requestGroupId
            || source.tool_name !== command.toolName
            || source.operation_id !== command.operationId
            || source.operation_binding_hash !== command.operationBindingHash
            || source.continuation_schema_version !== command.continuationSchemaVersion
            || command.schemaVersion !== 1
            || command.continuationSchemaVersion !== 1
            || !HASH_PATTERN.test(command.operationBindingHash)) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_source_invalid",
            };
        }
        const continuationId = approvedOperationContinuationId(command.approvalId);
        const inserted = this.db.prepare(`INSERT OR IGNORE INTO approved_operation_continuations
        (continuation_id, approval_id, run_id, request_group_id, tool_name,
         decision, operation_id, operation_binding_hash, schema_version,
         status, claim_owner_id, claim_expires_at, created_at, updated_at,
         completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', NULL, NULL, ?, ?, NULL)`).run(continuationId, command.approvalId, command.runId, command.requestGroupId, command.toolName, command.decision, command.operationId, command.operationBindingHash, now, now);
        const continuation = this.load(continuationId);
        if (!continuation || !sameCommand(continuation, command)) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_identity_conflict",
            };
        }
        return {
            status: inserted.changes === 1 ? "enqueued" : "existing",
            continuation,
        };
    }
    claimNext(input) {
        const now = input.now ?? Date.now();
        const ownerId = input.ownerId.trim();
        const leaseMs = Math.max(1, Math.floor(input.leaseMs));
        if (!ownerId)
            return { status: "none" };
        return this.db.transaction(() => {
            const candidate = this.db.prepare(`SELECT continuation_id
         FROM approved_operation_continuations
         WHERE status = 'pending'
            OR (status = 'claimed' AND claim_expires_at <= ?)
         ORDER BY created_at ASC, continuation_id ASC
         LIMIT 1`).get(now);
            if (!candidate)
                return { status: "none" };
            const updated = this.db.prepare(`UPDATE approved_operation_continuations
         SET status = 'claimed', claim_owner_id = ?, claim_expires_at = ?,
             updated_at = ?
         WHERE continuation_id = ?
           AND (
             status = 'pending'
             OR (status = 'claimed' AND claim_expires_at <= ?)
           )`).run(ownerId, now + leaseMs, now, candidate.continuation_id, now);
            if (updated.changes !== 1)
                return { status: "none" };
            const continuation = this.load(candidate.continuation_id);
            return continuation
                ? { status: "claimed", continuation }
                : { status: "none" };
        })();
    }
    claimById(input) {
        const now = input.now ?? Date.now();
        const ownerId = input.ownerId.trim();
        const leaseMs = Math.max(1, Math.floor(input.leaseMs));
        if (!ownerId || !input.continuationId.trim())
            return { status: "none" };
        const updated = this.db.prepare(`UPDATE approved_operation_continuations
       SET status = 'claimed', claim_owner_id = ?, claim_expires_at = ?,
           updated_at = ?
       WHERE continuation_id = ?
         AND (
           status = 'pending'
           OR (status = 'claimed' AND claim_expires_at <= ?)
         )`).run(ownerId, now + leaseMs, now, input.continuationId, now);
        if (updated.changes !== 1)
            return { status: "none" };
        const continuation = this.load(input.continuationId);
        return continuation
            ? { status: "claimed", continuation }
            : { status: "none" };
    }
    complete(input) {
        const now = input.now ?? Date.now();
        const current = this.load(input.continuationId);
        if (!current) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_not_found",
            };
        }
        if (current.status !== "claimed"
            || current.claimOwnerId !== input.ownerId) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
        }
        const updated = this.db.prepare(`UPDATE approved_operation_continuations
       SET status = 'completed', completed_at = ?, updated_at = ?,
           claim_expires_at = NULL
       WHERE continuation_id = ? AND status = 'claimed'
         AND claim_owner_id = ?`).run(now, now, input.continuationId, input.ownerId);
        const continuation = this.load(input.continuationId);
        return updated.changes === 1 && continuation
            ? { status: "completed", continuation }
            : {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
    }
    fail(input) {
        const now = input.now ?? Date.now();
        const current = this.load(input.continuationId);
        if (!current) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_not_found",
            };
        }
        if (current.status !== "claimed"
            || current.claimOwnerId !== input.ownerId) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
        }
        const updated = this.db.prepare(`UPDATE approved_operation_continuations
       SET status = 'failed', updated_at = ?, claim_expires_at = NULL
       WHERE continuation_id = ? AND status = 'claimed'
         AND claim_owner_id = ?`).run(now, input.continuationId, input.ownerId);
        const continuation = this.load(input.continuationId);
        return updated.changes === 1 && continuation
            ? { status: "failed", continuation }
            : {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
    }
    cancel(input) {
        const now = input.now ?? Date.now();
        const current = this.load(input.continuationId);
        if (!current) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_not_found",
            };
        }
        if (current.status !== "claimed"
            || current.claimOwnerId !== input.ownerId) {
            return {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
        }
        const updated = this.db.prepare(`UPDATE approved_operation_continuations
       SET status = 'cancelled', updated_at = ?, claim_expires_at = NULL
       WHERE continuation_id = ? AND status = 'claimed'
         AND claim_owner_id = ?`).run(now, input.continuationId, input.ownerId);
        const continuation = this.load(input.continuationId);
        return updated.changes === 1 && continuation
            ? { status: "cancelled", continuation }
            : {
                status: "rejected",
                reasonCode: "approval_continuation_claim_mismatch",
            };
    }
    load(continuationId) {
        const row = this.db.prepare(`SELECT * FROM approved_operation_continuations
       WHERE continuation_id = ?`).get(continuationId);
        return row ? mapRow(row) : undefined;
    }
}
function sameCommand(continuation, command) {
    return (continuation.approvalId === command.approvalId
        && continuation.runId === command.runId
        && continuation.requestGroupId === command.requestGroupId
        && continuation.toolName === command.toolName
        && continuation.decision === command.decision
        && continuation.operationId === command.operationId
        && continuation.operationBindingHash === command.operationBindingHash
        && continuation.schemaVersion === command.continuationSchemaVersion);
}
function mapRow(row) {
    return Object.freeze({
        continuationId: row.continuation_id,
        approvalId: row.approval_id,
        runId: row.run_id,
        requestGroupId: row.request_group_id,
        toolName: row.tool_name,
        decision: row.decision,
        operationId: row.operation_id,
        operationBindingHash: row.operation_binding_hash,
        schemaVersion: 1,
        status: row.status,
        claimOwnerId: row.claim_owner_id,
        claimExpiresAt: row.claim_expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
    });
}
//# sourceMappingURL=approved-operation-continuation-repository.js.map