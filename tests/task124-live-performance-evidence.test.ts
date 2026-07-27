import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import { parseLivePerformanceCliArguments } from "../packages/core/src/maintenance/live-performance-cli.ts"
import {
  type LivePerformanceEvidenceRecords,
  type LivePerformanceEvidenceSource,
  collectLivePerformanceEvidence,
} from "../packages/core/src/maintenance/live-performance-evidence.ts"
import { SqliteLivePerformanceEvidenceSource } from "../packages/core/src/maintenance/sqlite-live-performance-evidence-source.ts"

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (
  filename: string,
) => Database.Database
const databases: Database.Database[] = []
const temporaryDirectories: string[] = []

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close()
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function sqlite(): Database.Database {
  const database = new BetterSqlite3(":memory:")
  databases.push(database)
  database.exec(`
    CREATE TABLE root_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE orchestration_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      source TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      payload_redacted_json TEXT NOT NULL
    );
    CREATE TABLE queue_backpressure_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      queue_name TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      run_id TEXT,
      recovery_key TEXT
    );
  `)
  return database
}

function records(
  queueTransitions: LivePerformanceEvidenceRecords["queueTransitions"],
): LivePerformanceEvidenceRecords {
  return {
    run: { status: "completed", startedAt: 100, finishedAt: 300 },
    llmReceipts: [
      {
        schemaVersion: 1,
        invocationId: "invocation:task124",
        phase: "completed",
        at: 250,
        durationMs: 100,
        inputTokens: 10,
        outputTokens: 5,
        context: { runId: "run:task124", stage: "execution", operationCode: "agent_round" },
      },
    ],
    events: [
      { eventKind: "typed_observability:execution_started", payloadBytes: 100 },
      { eventKind: "typed_observability:evidence_recorded", payloadBytes: 200 },
    ],
    queueTransitions,
  }
}

function source(value: LivePerformanceEvidenceRecords): LivePerformanceEvidenceSource {
  return { read: () => ({ status: "ready", records: value }) }
}

describe("task124 live performance evidence collector", () => {
  it("pairs repeated recovery keys in FIFO order", () => {
    const result = collectLivePerformanceEvidence({
      source: source(
        records([
          { sequence: 1, at: 10, queueName: "delivery", eventKind: "queued", recoveryKey: "same" },
          { sequence: 2, at: 16, queueName: "delivery", eventKind: "running", recoveryKey: "same" },
          { sequence: 3, at: 20, queueName: "delivery", eventKind: "queued", recoveryKey: "same" },
          { sequence: 4, at: 47, queueName: "delivery", eventKind: "running", recoveryKey: "same" },
        ]),
      ),
      runId: "run:task124",
      flowId: "current_fact_read",
    })

    expect(result).toMatchObject({ status: "ready", sample: { queueWaitMs: 33 } })
  })

  it("rejects an unpaired queued transition instead of assuming zero wait", () => {
    const result = collectLivePerformanceEvidence({
      source: source(
        records([
          { sequence: 1, at: 10, queueName: "delivery", eventKind: "queued", recoveryKey: "open" },
        ]),
      ),
      runId: "run:task124",
      flowId: "current_fact_read",
    })

    expect(result).toEqual({ status: "rejected", reasonCode: "queue_transition_unpaired" })
  })

  it("rejects unsupported flows before reading runtime storage", () => {
    let readCount = 0
    const result = collectLivePerformanceEvidence({
      source: {
        read: () => {
          readCount += 1
          return { status: "ready", records: records([]) }
        },
      },
      runId: "run:task124",
      flowId: "untrusted_flow",
    })

    expect(result).toEqual({ status: "rejected", reasonCode: "flow_unsupported" })
    expect(readCount).toBe(0)
  })
})

describe("task124 SQLite live performance evidence source", () => {
  it("distinguishes a missing run without reading unrelated rows", () => {
    const result = new SqliteLivePerformanceEvidenceSource(sqlite()).read("missing-run")

    expect(result).toEqual({ status: "rejected", reasonCode: "run_not_found" })
  })

  it("rejects malformed persisted LLM receipts without returning raw payload", () => {
    const database = sqlite()
    database
      .prepare("INSERT INTO root_runs (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("run:malformed", "completed", 100, 200)
    database
      .prepare(
        "INSERT INTO orchestration_events (run_id, source, event_kind, payload_redacted_json) VALUES (?, ?, ?, ?)",
      )
      .run("run:malformed", "llm_invocation:v1", "llm_invocation:completed", "{malformed")

    const result = new SqliteLivePerformanceEvidenceSource(database).read("run:malformed")

    expect(result).toEqual({ status: "rejected", reasonCode: "llm_receipt_json_invalid" })
    expect(JSON.stringify(result)).not.toContain("{malformed")
  })

  it("rejects a persisted receipt correlated to another run", () => {
    const database = sqlite()
    database
      .prepare("INSERT INTO root_runs (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("run:target", "completed", 100, 200)
    database
      .prepare(
        "INSERT INTO orchestration_events (run_id, source, event_kind, payload_redacted_json) VALUES (?, ?, ?, ?)",
      )
      .run(
        "run:target",
        "llm_invocation:v1",
        "llm_invocation:completed",
        JSON.stringify({
          schemaVersion: 1,
          invocationId: "invocation:mismatch",
          phase: "completed",
          at: 150,
          durationMs: 50,
          context: { runId: "run:other", stage: "execution", operationCode: "agent_round" },
        }),
      )

    expect(new SqliteLivePerformanceEvidenceSource(database).read("run:target")).toEqual({
      status: "rejected",
      reasonCode: "llm_receipt_run_mismatch",
    })
  })
})

describe("task124 live performance audit CLI arguments", () => {
  it("accepts each required value exactly once", () => {
    expect(
      parseLivePerformanceCliArguments([
        "--database",
        "/tmp/runtime.db",
        "--run-id",
        "run:task124",
        "--flow-id",
        "current_fact_read",
      ]),
    ).toEqual({
      status: "ready",
      databasePath: "/tmp/runtime.db",
      runId: "run:task124",
      flowId: "current_fact_read",
    })
    expect(
      parseLivePerformanceCliArguments([
        "--",
        "--database",
        "/tmp/runtime.db",
        "--run-id",
        "run:task124",
        "--flow-id",
        "current_fact_read",
      ]),
    ).toMatchObject({ status: "ready", databasePath: "/tmp/runtime.db" })
  })

  it("rejects missing, duplicate, and unknown arguments", () => {
    expect(parseLivePerformanceCliArguments(["--database", "/tmp/runtime.db"])).toEqual({
      status: "rejected",
      reasonCode: "cli_argument_missing",
    })
    expect(
      parseLivePerformanceCliArguments([
        "--database",
        "/tmp/a.db",
        "--database",
        "/tmp/b.db",
        "--run-id",
        "run:task124",
        "--flow-id",
        "current_fact_read",
      ]),
    ).toEqual({ status: "rejected", reasonCode: "cli_argument_duplicate" })
    expect(parseLivePerformanceCliArguments(["--unknown", "value"])).toEqual({
      status: "rejected",
      reasonCode: "cli_argument_unknown",
    })
  })
})

describe("task124 live performance audit CLI", () => {
  it("emits only bounded aggregates from a read-only runtime database", () => {
    const directory = mkdtempSync(join(tmpdir(), "knowbee-task124-"))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, "runtime.db")
    const database = new BetterSqlite3(databasePath)
    databases.push(database)
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
      INSERT INTO root_runs VALUES ('run:cli', 'completed', 100, 300);
    `)
    const receipt = JSON.stringify({
      schemaVersion: 1,
      invocationId: "invocation:cli",
      phase: "completed",
      at: 250,
      durationMs: 100,
      inputTokens: 10,
      outputTokens: 5,
      context: { runId: "run:cli", stage: "execution", operationCode: "agent_round" },
    })
    const insertEvent = database.prepare(
      "INSERT INTO orchestration_events (run_id, source, event_kind, payload_redacted_json) VALUES (?, ?, ?, ?)",
    )
    insertEvent.run("run:cli", "llm_invocation:v1", "llm_invocation:completed", receipt)
    insertEvent.run(
      "run:cli",
      "typed_observability:v1",
      "typed_observability:execution_started",
      '{"private":"SECRET_USER_PROMPT"}',
    )
    insertEvent.run(
      "run:cli",
      "typed_observability:v1",
      "typed_observability:evidence_recorded",
      '{"private":"SECRET_TOOL_RESULT"}',
    )
    const insertQueue = database.prepare(
      "INSERT INTO queue_backpressure_events (id, created_at, queue_name, event_kind, run_id, recovery_key) VALUES (?, ?, ?, ?, ?, ?)",
    )
    insertQueue.run("q1", 10, "delivery", "queued", "run:cli", "same")
    insertQueue.run("r1", 16, "delivery", "running", "run:cli", "same")
    insertQueue.run("q2", 20, "delivery", "queued", "run:cli", "same")
    insertQueue.run("r2", 47, "delivery", "running", "run:cli", "same")
    database.close()
    databases.pop()

    const command = spawnSync(
      process.execPath,
      [
        resolve("scripts/audit-live-flow-performance.mjs"),
        "--database",
        databasePath,
        "--run-id",
        "run:cli",
        "--flow-id",
        "current_fact_read",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    )

    expect(command.status).toBe(0)
    expect(JSON.parse(command.stdout)).toMatchObject({
      status: "ready",
      sample: { durationMs: 200, llmCallCount: 1, attemptCount: 1, queueWaitMs: 33 },
    })
    expect(command.stdout).not.toMatch(/SECRET_|private|payload_redacted_json/)
    expect(command.stderr).toBe("")

    const missing = spawnSync(
      process.execPath,
      [
        resolve("scripts/audit-live-flow-performance.mjs"),
        "--database",
        databasePath,
        "--run-id",
        "run:missing",
        "--flow-id",
        "current_fact_read",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    )
    expect(missing.status).toBe(1)
    expect(missing.stdout).toBe("")
    expect(JSON.parse(missing.stderr)).toEqual({
      schemaVersion: 1,
      status: "rejected",
      reasonCode: "run_not_found",
    })
  })
})
