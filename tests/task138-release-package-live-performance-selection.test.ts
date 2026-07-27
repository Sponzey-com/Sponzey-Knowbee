import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { closeDb } from "../packages/core/src/db/index.js"
import type { LivePerformanceEvidenceSource } from "../packages/core/src/maintenance/live-performance-evidence.js"
import type { PerformanceAcceptanceMatrixCandidate } from "../packages/core/src/maintenance/performance-acceptance-matrix.js"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.js"
import {
  type PerformanceAcceptanceAuthorizationRecord,
  type PerformanceAcceptanceAuthorizationRepository,
  authorizePerformanceAcceptanceMatrix,
} from "../packages/core/src/release/performance-acceptance-authorization.js"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"

const require = createRequire(import.meta.url)
type BetterSqlite3Module = typeof import("better-sqlite3")
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Module
const tempDirs: string[] = []

function matrix(suffix = "unit"): PerformanceAcceptanceMatrixCandidate {
  const baselineVersion = `performance-baseline:task138:${suffix}`
  return {
    schemaVersion: 1,
    matrixId: `performance-matrix:task138:${suffix}`,
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 0,
        attemptCount: 1,
      })),
    },
    thresholds: Object.fromEntries(
      REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [
        flowId,
        { maxLatencyRegressionRatio: 2, maxLlmCallIncrease: 0, maxAttemptIncrease: 0 },
      ]),
    ),
  }
}

function selector(candidate: PerformanceAcceptanceMatrixCandidate) {
  return {
    matrixId: candidate.matrixId,
    matrixVersion: candidate.matrixVersion,
    baselineVersion: candidate.baselineVersion,
  }
}

function runs() {
  return REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
    flowId,
    runId: `run:${flowId}`,
  }))
}

function approve(
  candidate: PerformanceAcceptanceMatrixCandidate,
  repository: PerformanceAcceptanceAuthorizationRepository,
  authorizationId = "performance-authorization:task138",
) {
  const result = authorizePerformanceAcceptanceMatrix({
    candidate,
    decision: "approved",
    principal: {
      principalType: "authenticated_user",
      principalId: "administrator:task138",
      authenticationId: "authentication:task138",
      roles: ["release_administrator"],
    },
    authorizationId,
    decidedAt: 100,
    repository,
  })
  expect(result.status).toBe("recorded")
}

function memoryRepository(
  candidate: PerformanceAcceptanceMatrixCandidate,
): PerformanceAcceptanceAuthorizationRepository {
  const records: PerformanceAcceptanceAuthorizationRecord[] = []
  const repository: PerformanceAcceptanceAuthorizationRepository = {
    append(record) {
      records.push(structuredClone(record))
      return { status: "stored" }
    },
    findLatest(binding) {
      return records
        .filter(
          (record) =>
            record.matrixId === binding.matrixId &&
            record.matrixVersion === binding.matrixVersion &&
            record.baselineVersion === binding.baselineVersion,
        )
        .at(-1)
    },
  }
  approve(candidate, repository)
  return repository
}

function source(incompleteRunId?: string): LivePerformanceEvidenceSource {
  return {
    read(runId) {
      return {
        status: "ready",
        records: {
          run: {
            status: runId === incompleteRunId ? "running" : "completed",
            startedAt: 100,
            finishedAt: 220,
          },
          llmReceipts: [],
          events: [{ eventKind: "typed_observability:execution_started", payloadBytes: 10 }],
          queueTransitions: [],
        },
      }
    },
  }
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task138 release package live performance selection", () => {
  it("injects evidence collected from an exact approved five-run selection", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task138-manifest-"))
    tempDirs.push(root)
    const runtime = createTestRuntimeConfigFixture({ rootDir: root })
    const candidate = matrix()

    const manifest = buildReleaseManifest({
      rootDir: root,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
      livePerformanceAcceptanceSelection: {
        selector: selector(candidate),
        repository: memoryRepository(candidate),
        source: source(),
        runs: runs(),
      },
    })

    expect(manifest.performanceEvidence.acceptance).toEqual({
      status: "accepted",
      matrixId: candidate.matrixId,
      matrixVersion: 1,
      baselineVersion: candidate.baselineVersion,
      authorizationId: "performance-authorization:task138",
      reasonCodes: [],
    })
    expect(manifest.subAgentReleaseGate.checks).toContainEqual(
      expect.objectContaining({ id: "performance_acceptance", status: "passed" }),
    )
  })

  it("keeps absent, partial and incomplete live contexts fail closed", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task138-invalid-"))
    tempDirs.push(root)
    const runtime = createTestRuntimeConfigFixture({ rootDir: root })
    const candidate = matrix("invalid")
    const base = {
      rootDir: root,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
    }

    expect(buildReleaseManifest(base).performanceEvidence.acceptance).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["performance_acceptance_evidence_missing"],
    })
    expect(
      buildReleaseManifest({
        ...base,
        livePerformanceAcceptanceSelection: { selector: selector(candidate) } as never,
      }).performanceEvidence.acceptance,
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["performance_acceptance_context_invalid"],
    })
    expect(
      buildReleaseManifest({
        ...base,
        livePerformanceAcceptanceSelection: {
          selector: selector(candidate),
          repository: memoryRepository(candidate),
          source: source("run:cancel"),
          runs: runs(),
        },
      }).performanceEvidence.acceptance,
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["flow:cancel:collection:run_not_completed"],
    })
    expect(
      buildReleaseManifest({
        ...base,
        livePerformanceAcceptanceSelection: {
          selector: selector(candidate),
          repository: {
            append: () => ({ status: "stored" as const }),
            findLatest: () => undefined,
          },
          source: source(),
          runs: runs(),
        },
      }).performanceEvidence.acceptance,
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_missing"],
    })
  })

  it("requires complete CLI arguments and reads the selected database without raw payload output", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task138-cli-"))
    tempDirs.push(directory)
    const stateDir = join(directory, "state")
    const databasePath = join(directory, "performance.db")
    const database = new BetterSqlite3(databasePath)
    const candidate = matrix("cli")
    try {
      database.exec(`
        CREATE TABLE root_runs (
          id TEXT PRIMARY KEY, status TEXT NOT NULL,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE orchestration_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT,
          source TEXT NOT NULL, event_kind TEXT NOT NULL,
          payload_redacted_json TEXT NOT NULL
        );
        CREATE TABLE queue_backpressure_events (
          id TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
          queue_name TEXT NOT NULL, event_kind TEXT NOT NULL,
          run_id TEXT, recovery_key TEXT
        );
        CREATE TABLE performance_acceptance_authorizations (
          sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
          authorization_id TEXT NOT NULL UNIQUE,
          schema_version INTEGER NOT NULL,
          decision TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          authentication_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          matrix_id TEXT NOT NULL,
          matrix_version INTEGER NOT NULL,
          baseline_version TEXT NOT NULL,
          threshold_snapshot_json TEXT NOT NULL,
          decided_at INTEGER NOT NULL,
          baseline_snapshot_json TEXT
        );
      `)
      approve(
        candidate,
        new SqlitePerformanceAcceptanceAuthorizationRepository(database),
        "performance-authorization:task138:cli",
      )
      const insertRun = database.prepare("INSERT INTO root_runs VALUES (?, 'completed', 100, 220)")
      const insertEvent = database.prepare(
        "INSERT INTO orchestration_events (run_id, source, event_kind, payload_redacted_json) VALUES (?, 'typed_observability:v1', 'typed_observability:execution_started', ?)",
      )
      for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
        insertRun.run(`run:${flowId}`)
        insertEvent.run(`run:${flowId}`, '{"private":"SECRET_TASK138_PAYLOAD"}')
      }
      database.close()

      const script = resolve("scripts/release-package.mjs")
      const partial = spawnSync(
        process.execPath,
        [script, "--dry-run", "--database", databasePath, "--matrix-id", candidate.matrixId],
        {
          cwd: resolve("."),
          encoding: "utf8",
          env: { ...process.env, KNOWBEE_STATE_DIR: stateDir },
        },
      )
      expect(partial.status).not.toBe(0)
      expect(partial.stderr).toContain("matrix_version_invalid")

      const args = [
        script,
        "--dry-run",
        "--json",
        "--no-copy",
        "--output-dir",
        join(directory, "release"),
        "--database",
        databasePath,
        "--matrix-id",
        candidate.matrixId,
        "--matrix-version",
        "1",
        "--baseline-version",
        candidate.baselineVersion,
        ...runs().flatMap((run) => ["--run", `${run.flowId}=${run.runId}`]),
      ]
      const selected = spawnSync(process.execPath, args, {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, KNOWBEE_STATE_DIR: stateDir },
      })
      expect(selected.status, selected.stderr).toBe(0)
      const output = JSON.parse(selected.stdout) as {
        manifest: {
          performanceEvidence: { acceptance: { status: string; authorizationId: string } }
        }
      }
      expect(output.manifest.performanceEvidence.acceptance).toMatchObject({
        status: "accepted",
        authorizationId: "performance-authorization:task138:cli",
      })
      expect(selected.stdout).not.toMatch(
        /SECRET_TASK138_PAYLOAD|thresholdSnapshot|baselineSnapshot/,
      )
    } finally {
      if (database.open) database.close()
    }
  })
})
