import type Database from "better-sqlite3"
import type {
  ReleasePolicyAuthorizationBinding,
  ReleasePolicyAuthorizationRecord,
  ReleasePolicyAuthorizationRepository,
} from "./release-policy-authorization.js"
import {
  type SubAgentReleaseThresholds,
  validateSubAgentRolloutThresholdPolicy,
} from "./sub-agent-rollout-threshold-policy.js"

interface ReleasePolicyAuthorizationRow {
  authorization_id: string
  schema_version: number
  decision: string
  actor_type: string
  actor_id: string
  authentication_id: string
  scope: string
  policy_id: string
  policy_version: number
  release_mode: string
  threshold_snapshot_json: string
  decided_at: number
}

function parseThresholdSnapshot(value: string): SubAgentReleaseThresholds | undefined {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed as SubAgentReleaseThresholds
  } catch {
    return undefined
  }
}

function mapRow(
  row: ReleasePolicyAuthorizationRow,
): Readonly<ReleasePolicyAuthorizationRecord> | undefined {
  const thresholds = parseThresholdSnapshot(row.threshold_snapshot_json)
  if (!thresholds) return undefined
  if (
    row.schema_version !== 1 ||
    (row.decision !== "approved" && row.decision !== "denied" && row.decision !== "revoked") ||
    row.actor_type !== "administrator" ||
    !row.actor_id.trim() ||
    !row.authentication_id.trim() ||
    row.scope !== "sub_agent_rollout_thresholds" ||
    (row.release_mode !== "limited_beta" && row.release_mode !== "full_enable") ||
    !row.authorization_id.trim() ||
    !Number.isSafeInteger(row.decided_at) ||
    row.decided_at < 0
  ) {
    return undefined
  }
  const validation = validateSubAgentRolloutThresholdPolicy({
    schemaVersion: 1,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    releaseMode: row.release_mode,
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
    scope: "sub_agent_rollout_thresholds",
    policyId: validation.candidate.policyId,
    policyVersion: validation.candidate.policyVersion,
    releaseMode: validation.candidate.releaseMode,
    thresholdSnapshot: Object.freeze({ ...validation.candidate.thresholds }),
    approvedAt: row.decided_at,
  })
}

export class SqliteReleasePolicyAuthorizationRepository
  implements ReleasePolicyAuthorizationRepository
{
  constructor(private readonly db: Database.Database) {}

  append(record: Readonly<ReleasePolicyAuthorizationRecord>): {
    status: "stored" | "duplicate_id"
  } {
    try {
      this.db
        .prepare(
          `INSERT INTO release_policy_authorizations (
            authorization_id, schema_version, decision, actor_type, actor_id,
            authentication_id, scope, policy_id, policy_version, release_mode,
            threshold_snapshot_json, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.authorizationId,
          record.schemaVersion,
          record.decision,
          record.actorType,
          record.actorId,
          record.authenticationId,
          record.scope,
          record.policyId,
          record.policyVersion,
          record.releaseMode,
          JSON.stringify(record.thresholdSnapshot),
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
    binding: Readonly<ReleasePolicyAuthorizationBinding>,
  ): Readonly<ReleasePolicyAuthorizationRecord> | undefined {
    try {
      const row = this.db
        .prepare<[string, string, number, string], ReleasePolicyAuthorizationRow>(
          `SELECT authorization_id, schema_version, decision, actor_type, actor_id,
                  authentication_id, scope, policy_id, policy_version, release_mode,
                  threshold_snapshot_json, decided_at
           FROM release_policy_authorizations
           WHERE scope = ? AND policy_id = ? AND policy_version = ? AND release_mode = ?
           ORDER BY sequence_id DESC
           LIMIT 1`,
        )
        .get(binding.scope, binding.policyId, binding.policyVersion, binding.releaseMode)
      return row ? mapRow(row) : undefined
    } catch {
      return undefined
    }
  }
}
