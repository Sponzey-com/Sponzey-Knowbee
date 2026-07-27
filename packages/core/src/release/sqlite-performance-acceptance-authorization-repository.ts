import type Database from "better-sqlite3"
import {
  type PerformanceAcceptanceMatrixCandidate,
  validatePerformanceAcceptanceMatrix,
} from "../maintenance/performance-acceptance-matrix.js"
import type {
  PerformanceAcceptanceAuthorizationBinding,
  PerformanceAcceptanceAuthorizationRecord,
  PerformanceAcceptanceAuthorizationRepository,
} from "./performance-acceptance-authorization.js"

interface PerformanceAcceptanceAuthorizationRow {
  authorization_id: string
  schema_version: number
  decision: string
  actor_type: string
  actor_id: string
  authentication_id: string
  scope: string
  matrix_id: string
  matrix_version: number
  baseline_version: string
  threshold_snapshot_json: string
  baseline_snapshot_json: string | null
  decided_at: number
}

function parseBaselineSnapshot(
  value: string | null,
): PerformanceAcceptanceMatrixCandidate["baselineSnapshot"] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed as PerformanceAcceptanceMatrixCandidate["baselineSnapshot"]
  } catch {
    return undefined
  }
}

function parseThresholdSnapshot(
  value: string,
): PerformanceAcceptanceMatrixCandidate["thresholds"] | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed as PerformanceAcceptanceMatrixCandidate["thresholds"]
  } catch {
    return undefined
  }
}

function mapRow(
  row: PerformanceAcceptanceAuthorizationRow,
): Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined {
  const thresholds = parseThresholdSnapshot(row.threshold_snapshot_json)
  const baselineSnapshot = parseBaselineSnapshot(row.baseline_snapshot_json)
  if (!thresholds || !baselineSnapshot) return undefined
  if (
    row.schema_version !== 1 ||
    (row.decision !== "approved" && row.decision !== "denied" && row.decision !== "revoked") ||
    row.actor_type !== "administrator" ||
    !row.actor_id.trim() ||
    !row.authentication_id.trim() ||
    row.scope !== "performance_release_gate" ||
    !row.authorization_id.trim() ||
    !Number.isSafeInteger(row.decided_at) ||
    row.decided_at < 0
  ) {
    return undefined
  }
  const validation = validatePerformanceAcceptanceMatrix({
    schemaVersion: 1,
    matrixId: row.matrix_id,
    matrixVersion: row.matrix_version,
    baselineVersion: row.baseline_version,
    baselineSnapshot,
    thresholds,
  })
  if (validation.status === "baseline_only") return undefined
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
  })
}

export class SqlitePerformanceAcceptanceAuthorizationRepository
  implements PerformanceAcceptanceAuthorizationRepository
{
  constructor(private readonly db: Database.Database) {}

  append(record: Readonly<PerformanceAcceptanceAuthorizationRecord>): {
    status: "stored" | "duplicate_id"
  } {
    try {
      this.db
        .prepare(
          `INSERT INTO performance_acceptance_authorizations (
            authorization_id, schema_version, decision, actor_type, actor_id,
            authentication_id, scope, matrix_id, matrix_version, baseline_version,
            threshold_snapshot_json, baseline_snapshot_json, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.authorizationId,
          record.schemaVersion,
          record.decision,
          record.actorType,
          record.actorId,
          record.authenticationId,
          record.scope,
          record.matrixId,
          record.matrixVersion,
          record.baselineVersion,
          JSON.stringify(record.thresholdSnapshot),
          JSON.stringify(record.baselineSnapshot),
          record.approvedAt,
        )
      return { status: "stored" }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : ""
      if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        return { status: "duplicate_id" }
      }
      throw error
    }
  }

  findLatest(
    binding: Readonly<PerformanceAcceptanceAuthorizationBinding>,
  ): Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined {
    try {
      const row = this.db
        .prepare<[string, string, number, string], PerformanceAcceptanceAuthorizationRow>(
          `SELECT authorization_id, schema_version, decision, actor_type, actor_id,
                  authentication_id, scope, matrix_id, matrix_version, baseline_version,
                  threshold_snapshot_json, baseline_snapshot_json, decided_at
           FROM performance_acceptance_authorizations
           WHERE scope = ? AND matrix_id = ? AND matrix_version = ? AND baseline_version = ?
           ORDER BY sequence_id DESC
           LIMIT 1`,
        )
        .get(binding.scope, binding.matrixId, binding.matrixVersion, binding.baselineVersion)
      return row ? mapRow(row) : undefined
    } catch {
      return undefined
    }
  }
}
