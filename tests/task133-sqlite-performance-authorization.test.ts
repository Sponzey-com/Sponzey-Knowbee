import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runMigrations } from "../packages/core/src/db/migrations.ts"
import type { PerformanceAcceptanceMatrixCandidate } from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import {
  authorizePerformanceAcceptanceMatrix,
  createPerformanceAcceptanceAuthorizationPort,
} from "../packages/core/src/release/performance-acceptance-authorization.ts"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.ts"

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
  const root = mkdtempSync(join(tmpdir(), "knowbee-performance-authorization-db-"))
  tempDirs.push(root)
  const path = join(root, "knowbee.db")
  const db = new Database(path)
  runMigrations(db)
  return { db, path }
}

function matrix(): PerformanceAcceptanceMatrixCandidate {
  const threshold = {
    maxLatencyRegressionRatio: 2,
    maxLlmCallIncrease: 1,
    maxAttemptIncrease: 1,
  }
  const baselineVersion = "performance-baseline:v1"
  return {
    schemaVersion: 1,
    matrixId: "performance-matrix:task133",
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 1,
        attemptCount: 1,
      })),
    },
    thresholds: {
      direct_answer: { ...threshold },
      current_fact_read: { ...threshold },
      tool_write: { ...threshold },
      child_delegation: { ...threshold },
      cancel: { ...threshold },
    },
  }
}

function authorize(input: {
  repository: SqlitePerformanceAcceptanceAuthorizationRepository
  decision: "approved" | "denied" | "revoked"
  authorizationId: string
}) {
  return authorizePerformanceAcceptanceMatrix({
    candidate: matrix(),
    decision: input.decision,
    principal: {
      principalType: "authenticated_user",
      principalId: "administrator:task133",
      authenticationId: "authentication:task133",
      roles: ["release_administrator"],
    },
    authorizationId: input.authorizationId,
    decidedAt: 100,
    repository: input.repository,
  })
}

describe("task133 SQLite performance authorization repository", () => {
  it("creates the append-only table and exact-binding index in migration v61", () => {
    const { db } = openMigratedDatabase()

    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get("performance_acceptance_authorizations"),
    ).toBeTruthy()
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
        .get("idx_performance_acceptance_authorizations_binding"),
    ).toBeTruthy()
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version = 61").get()).toEqual({
      version: 61,
    })
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version = 62").get()).toEqual({
      version: 62,
    })
    expect(
      db
        .prepare("SELECT name FROM pragma_table_info(?) WHERE name = ?")
        .get("performance_acceptance_authorizations", "baseline_snapshot_json"),
    ).toBeTruthy()
    db.close()
  })

  it("stores immutable records and rejects duplicate authorization IDs", () => {
    const { db } = openMigratedDatabase()
    const repository = new SqlitePerformanceAcceptanceAuthorizationRepository(db)

    expect(
      authorize({
        repository,
        decision: "approved",
        authorizationId: "performance-authorization:1",
      }).status,
    ).toBe("recorded")
    expect(
      authorize({
        repository,
        decision: "approved",
        authorizationId: "performance-authorization:1",
      }),
    ).toEqual({ status: "rejected", reasonCode: "performance_authorization_id_duplicate" })
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM performance_acceptance_authorizations").get(),
    ).toEqual({ count: 1 })
    db.close()
  })

  it("restores only the latest valid exact decision after close and reopen", () => {
    const { db, path } = openMigratedDatabase()
    const repository = new SqlitePerformanceAcceptanceAuthorizationRepository(db)
    authorize({
      repository,
      decision: "approved",
      authorizationId: "performance-authorization:approved",
    })
    authorize({
      repository,
      decision: "revoked",
      authorizationId: "performance-authorization:revoked",
    })
    db.close()

    const reopened = new Database(path)
    const restored = new SqlitePerformanceAcceptanceAuthorizationRepository(reopened)
    expect(createPerformanceAcceptanceAuthorizationPort(restored).resolve(matrix())).toBeUndefined()
    expect(
      restored.findLatest({
        scope: "performance_release_gate",
        matrixId: matrix().matrixId,
        matrixVersion: matrix().matrixVersion,
        baselineVersion: matrix().baselineVersion,
      })?.decision,
    ).toBe("revoked")

    reopened
      .prepare(
        "UPDATE performance_acceptance_authorizations SET baseline_snapshot_json = NULL WHERE authorization_id = ?",
      )
      .run("performance-authorization:revoked")
    expect(
      restored.findLatest({
        scope: "performance_release_gate",
        matrixId: matrix().matrixId,
        matrixVersion: matrix().matrixVersion,
        baselineVersion: matrix().baselineVersion,
      }),
    ).toBeUndefined()
    reopened
      .prepare(
        "UPDATE performance_acceptance_authorizations SET baseline_snapshot_json = ? WHERE authorization_id = ?",
      )
      .run(JSON.stringify(matrix().baselineSnapshot), "performance-authorization:revoked")

    reopened
      .prepare(
        "UPDATE performance_acceptance_authorizations SET threshold_snapshot_json = ? WHERE authorization_id = ?",
      )
      .run("{}", "performance-authorization:revoked")
    expect(
      restored.findLatest({
        scope: "performance_release_gate",
        matrixId: matrix().matrixId,
        matrixVersion: matrix().matrixVersion,
        baselineVersion: matrix().baselineVersion,
      }),
    ).toBeUndefined()
    reopened.close()
  })
})
