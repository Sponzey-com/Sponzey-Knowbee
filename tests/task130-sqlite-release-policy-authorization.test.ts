import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runMigrations } from "../packages/core/src/db/migrations.ts"
import {
  authorizeSubAgentRolloutThresholdPolicy,
  createSubAgentRolloutThresholdAuthorizationPort,
} from "../packages/core/src/release/release-policy-authorization.ts"
import { SqliteReleasePolicyAuthorizationRepository } from "../packages/core/src/release/sqlite-release-policy-authorization-repository.ts"
import { SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS } from "../packages/core/src/release/sub-agent-release-gate.ts"
import type { SubAgentRolloutThresholdPolicyCandidate } from "../packages/core/src/release/sub-agent-rollout-threshold-policy.ts"

const tempDirs: string[] = []
const require = createRequire(import.meta.url)
type BetterSqlite3Module = typeof import("better-sqlite3")
const Database = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Module

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function openMigratedDatabase() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-release-policy-db-"))
  tempDirs.push(root)
  const path = join(root, "knowbee.db")
  const db = new Database(path)
  runMigrations(db)
  return { db, path }
}

function policy(): SubAgentRolloutThresholdPolicyCandidate {
  return {
    schemaVersion: 1,
    policyId: "rollout-policy:sqlite-test",
    policyVersion: 1,
    releaseMode: "limited_beta",
    thresholds: { ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS },
  }
}

function authorize(input: {
  repository: SqliteReleasePolicyAuthorizationRepository
  decision: "approved" | "denied" | "revoked"
  authorizationId: string
  decidedAt: number
}) {
  return authorizeSubAgentRolloutThresholdPolicy({
    candidate: policy(),
    decision: input.decision,
    principal: {
      principalType: "authenticated_user",
      principalId: "administrator:sqlite-test",
      authenticationId: "authentication:sqlite-test",
      roles: ["release_administrator"],
    },
    authorizationId: input.authorizationId,
    decidedAt: input.decidedAt,
    repository: input.repository,
  })
}

describe("task130 SQLite release-policy authorization repository", () => {
  it("creates the append-only authorization table and latest-binding index in migration v60", () => {
    const { db } = openMigratedDatabase()

    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("release_policy_authorizations"),
    ).toBeTruthy()
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get("idx_release_policy_authorizations_binding"),
    ).toBeTruthy()
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version = 60").get()).toEqual({
      version: 60,
    })
    db.close()
  })

  it("stores immutable records and rejects duplicate authorization IDs", () => {
    const { db } = openMigratedDatabase()
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)

    const first = authorize({
      repository,
      decision: "approved",
      authorizationId: "authorization:sqlite:1",
      decidedAt: 100,
    })
    const duplicate = authorize({
      repository,
      decision: "approved",
      authorizationId: "authorization:sqlite:1",
      decidedAt: 101,
    })

    expect(first.status).toBe("recorded")
    expect(duplicate).toEqual({
      status: "rejected",
      reasonCode: "release_authorization_id_duplicate",
    })
    expect(db.prepare("SELECT COUNT(*) AS count FROM release_policy_authorizations").get()).toEqual(
      { count: 1 },
    )
    db.close()
  })

  it("restores the latest exact decision after close and reopen", () => {
    const { db, path } = openMigratedDatabase()
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    authorize({
      repository,
      decision: "approved",
      authorizationId: "authorization:sqlite:approved",
      decidedAt: 100,
    })
    authorize({
      repository,
      decision: "revoked",
      authorizationId: "authorization:sqlite:revoked",
      decidedAt: 100,
    })
    db.close()

    const reopened = new Database(path)
    const restored = new SqliteReleasePolicyAuthorizationRepository(reopened)
    expect(
      createSubAgentRolloutThresholdAuthorizationPort(restored).resolve(policy()),
    ).toBeUndefined()
    expect(
      restored.findLatest({
        scope: "sub_agent_rollout_thresholds",
        policyId: policy().policyId,
        policyVersion: policy().policyVersion,
        releaseMode: policy().releaseMode,
      })?.decision,
    ).toBe("revoked")
    reopened.close()
  })
})
