import { validatePerformanceAcceptanceMatrix, } from "../maintenance/performance-acceptance-matrix.js";
function parseBaselineSnapshot(value) {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
function parseThresholdSnapshot(value) {
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
function mapRow(row) {
    const thresholds = parseThresholdSnapshot(row.threshold_snapshot_json);
    const baselineSnapshot = parseBaselineSnapshot(row.baseline_snapshot_json);
    if (!thresholds || !baselineSnapshot)
        return undefined;
    if (row.schema_version !== 1 ||
        (row.decision !== "approved" && row.decision !== "denied" && row.decision !== "revoked") ||
        row.actor_type !== "administrator" ||
        !row.actor_id.trim() ||
        !row.authentication_id.trim() ||
        row.scope !== "performance_release_gate" ||
        !row.authorization_id.trim() ||
        !Number.isSafeInteger(row.decided_at) ||
        row.decided_at < 0) {
        return undefined;
    }
    const validation = validatePerformanceAcceptanceMatrix({
        schemaVersion: 1,
        matrixId: row.matrix_id,
        matrixVersion: row.matrix_version,
        baselineVersion: row.baseline_version,
        baselineSnapshot,
        thresholds,
    });
    if (validation.status === "baseline_only")
        return undefined;
    return Object.freeze({
        schemaVersion: 1,
        authorizationId: row.authorization_id,
        decision: row.decision,
        actorType: "administrator",
        actorId: row.actor_id,
        authenticationId: row.authentication_id,
        scope: "performance_release_gate",
        matrixId: validation.candidate.matrixId,
        matrixVersion: validation.candidate.matrixVersion,
        baselineVersion: validation.candidate.baselineVersion,
        thresholdSnapshot: validation.candidate.thresholds,
        baselineSnapshot: validation.candidate.baselineSnapshot,
        approvedAt: row.decided_at,
    });
}
export class SqlitePerformanceAcceptanceAuthorizationRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    append(record) {
        try {
            this.db
                .prepare(`INSERT INTO performance_acceptance_authorizations (
            authorization_id, schema_version, decision, actor_type, actor_id,
            authentication_id, scope, matrix_id, matrix_version, baseline_version,
            threshold_snapshot_json, baseline_snapshot_json, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(record.authorizationId, record.schemaVersion, record.decision, record.actorType, record.actorId, record.authenticationId, record.scope, record.matrixId, record.matrixVersion, record.baselineVersion, JSON.stringify(record.thresholdSnapshot), JSON.stringify(record.baselineSnapshot), record.approvedAt);
            return { status: "stored" };
        }
        catch (error) {
            const code = error && typeof error === "object" && "code" in error
                ? String(error.code)
                : "";
            if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
                return { status: "duplicate_id" };
            }
            throw error;
        }
    }
    findLatest(binding) {
        try {
            const row = this.db
                .prepare(`SELECT authorization_id, schema_version, decision, actor_type, actor_id,
                  authentication_id, scope, matrix_id, matrix_version, baseline_version,
                  threshold_snapshot_json, baseline_snapshot_json, decided_at
           FROM performance_acceptance_authorizations
           WHERE scope = ? AND matrix_id = ? AND matrix_version = ? AND baseline_version = ?
           ORDER BY sequence_id DESC
           LIMIT 1`)
                .get(binding.scope, binding.matrixId, binding.matrixVersion, binding.baselineVersion);
            return row ? mapRow(row) : undefined;
        }
        catch {
            return undefined;
        }
    }
}
//# sourceMappingURL=sqlite-performance-acceptance-authorization-repository.js.map