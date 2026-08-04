import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { parseLivePerformanceAcceptanceCliArguments } from "../packages/core/src/maintenance/live-performance-acceptance-cli.ts"
import type { PerformanceAcceptanceMatrixCandidate } from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import { authorizePerformanceAcceptanceMatrix } from "../packages/core/src/release/performance-acceptance-authorization.ts"
import { SqlitePerformanceAcceptanceAuthorizationRepository } from "../packages/core/src/release/sqlite-performance-acceptance-authorization-repository.ts"

const require = createRequire(import.meta.url)
type BetterSqlite3Module = typeof import("better-sqlite3")
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Module

const completeArguments = [
  "--database",
  "/tmp/runtime.db",
  "--matrix-id",
  "performance-matrix:1",
  "--matrix-version",
  "1",
  "--baseline-version",
  "performance-baseline:v1",
  "--run",
  "direct_answer=run:direct",
  "--run",
  "current_fact_read=run:fact",
  "--run",
  "tool_write=run:tool",
  "--run",
  "child_delegation=run:child",
  "--run",
  "cancel=run:cancel",
]

describe("task137 live performance acceptance CLI", () => {
  it("parses one immutable selector and exactly five flow-run bindings", () => {
    expect(parseLivePerformanceAcceptanceCliArguments(completeArguments)).toEqual({
      status: "ready",
      databasePath: "/tmp/runtime.db",
      selector: {
        matrixId: "performance-matrix:1",
        matrixVersion: 1,
        baselineVersion: "performance-baseline:v1",
      },
      runs: [
        { flowId: "direct_answer", runId: "run:direct" },
        { flowId: "current_fact_read", runId: "run:fact" },
        { flowId: "tool_write", runId: "run:tool" },
        { flowId: "child_delegation", runId: "run:child" },
        { flowId: "cancel", runId: "run:cancel" },
      ],
    })
  })

  it.each([
    [completeArguments.slice(0, 2), "matrix_id_required"],
    [
      completeArguments.map((value, index) => (index === 5 ? "0" : value)),
      "matrix_version_invalid",
    ],
    [[...completeArguments.slice(0, -2)], "performance_flow_missing:cancel"],
    [[...completeArguments, "--run", "cancel=run:other"], "performance_flow_duplicate:cancel"],
    [[...completeArguments, "--unknown"], "argument_unknown"],
  ])("rejects incomplete or ambiguous arguments", (arguments_, reasonCode) => {
    expect(parseLivePerformanceAcceptanceCliArguments(arguments_)).toEqual({
      status: "rejected",
      reasonCode,
    })
  })

  it("reads five runs from SQLite without exposing raw runtime payloads", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task137-cli-"))
    const databasePath = join(directory, "runtime.db")
    const database = new BetterSqlite3(databasePath)
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
      const baselineVersion = "performance-baseline:cli:v1"
      const threshold = {
        maxLatencyRegressionRatio: 2,
        maxLlmCallIncrease: 0,
        maxAttemptIncrease: 0,
      }
      const candidate: PerformanceAcceptanceMatrixCandidate = {
        schemaVersion: 1,
        matrixId: "performance-matrix:cli",
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
          REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [flowId, { ...threshold }]),
        ),
      }
      authorizePerformanceAcceptanceMatrix({
        candidate,
        decision: "approved",
        principal: {
          principalType: "authenticated_user",
          principalId: "administrator:cli",
          authenticationId: "authentication:cli",
          roles: ["release_administrator"],
        },
        authorizationId: "performance-authorization:cli",
        decidedAt: 100,
        repository: new SqlitePerformanceAcceptanceAuthorizationRepository(database),
      })
      const insertRun = database.prepare("INSERT INTO root_runs VALUES (?, 'completed', 100, 220)")
      const insertEvent = database.prepare(
        "INSERT INTO orchestration_events (run_id, source, event_kind, payload_redacted_json) VALUES (?, 'typed_observability:v1', 'typed_observability:execution_started', ?)",
      )
      for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
        insertRun.run(`run:${flowId}`)
        insertEvent.run(`run:${flowId}`, '{"private":"SECRET_RUNTIME_PAYLOAD"}')
      }
      database.close()

      const arguments_ = completeArguments.map((value) =>
        value === "/tmp/runtime.db"
          ? databasePath
          : value === "performance-matrix:1"
            ? candidate.matrixId
            : value === "performance-baseline:v1"
              ? candidate.baselineVersion
              : value
                  .replace("run:direct", "run:direct_answer")
                  .replace("run:fact", "run:current_fact_read")
                  .replace("run:tool", "run:tool_write")
                  .replace("run:child", "run:child_delegation"),
      )
      const command = spawnSync(
        process.execPath,
        [resolve("scripts/self/audit-live-performance-acceptance.mjs"), ...arguments_],
        { cwd: resolve("."), encoding: "utf8" },
      )
      expect(command.status, command.stderr).toBe(0)
      expect(JSON.parse(command.stdout)).toMatchObject({
        kind: "knowbee.audit.live_performance_acceptance",
        status: "accepted",
        authorizationId: "performance-authorization:cli",
      })
      expect(command.stdout).not.toMatch(/SECRET_|private|thresholdSnapshot/)
      expect(command.stderr).toBe("")
    } finally {
      if (database.open) database.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
