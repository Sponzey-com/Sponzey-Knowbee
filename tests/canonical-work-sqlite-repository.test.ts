import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import {
  CanonicalWorkPersistenceCorruptionError,
  SqliteCanonicalWorkRepository,
} from "../packages/core/src/db/canonical-work-repository.ts"
import {
  applyCanonicalWorkEvent,
  createCanonicalWorkAggregate,
} from "../packages/core/src/contracts/canonical-work-aggregate.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function openDb() {
  return getDb({ paths })
}

function seedRootRun() {
  const now = Date.now()
  insertSession({ id: "session:1", source: "webui", source_id: "user:1", created_at: now, updated_at: now, summary: "test" })
  createRootRun({ id: "run:1", sessionId: "session:1", prompt: "test request", source: "webui" })
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-canonical-work-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  openDb()
  seedRootRun()
  openDb().prepare("DELETE FROM canonical_work_aggregates WHERE root_run_id = ?").run("run:1")
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("canonical work SQLite repository", () => {
  it("installs the v54 canonical aggregate table and root-run index", () => {
    const db = openDb()
    const version = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')").all() as Array<{ name: string }>).map((row) => row.name)
    expect(version.version).toBeGreaterThanOrEqual(54)
    expect(names).toEqual(expect.arrayContaining(["canonical_work_aggregates", "idx_canonical_work_root_run"]))
  })

  it("restores the exact aggregate after closing and reopening the database", () => {
    const repository = new SqliteCanonicalWorkRepository(openDb(), () => 1_000)
    const initial = createCanonicalWorkAggregate({ workId: "work:1", rootRunId: "run:1" })
    expect(repository.create(initial)).toEqual({ created: true })
    const applied = applyCanonicalWorkEvent({ aggregate: initial, expectedRevision: 0, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:1" })
    if (!applied.applied) throw new Error("fixture transition failed")
    expect(repository.save({ aggregate: applied.aggregate, expectedRevision: 0 })).toEqual({ saved: true })

    closeDb()
    const restored = new SqliteCanonicalWorkRepository(openDb(), () => 2_000).load("work:1")
    expect(restored).toEqual(applied.aggregate)
  })

  it("allows only one writer for the same expected revision", () => {
    const repository = new SqliteCanonicalWorkRepository(openDb(), () => 1_000)
    const initial = createCanonicalWorkAggregate({ workId: "work:1", rootRunId: "run:1" })
    repository.create(initial)
    const first = applyCanonicalWorkEvent({ aggregate: initial, expectedRevision: 0, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:first" })
    const second = applyCanonicalWorkEvent({ aggregate: initial, expectedRevision: 0, event: "INPUT_REQUIRED", receiptRef: "receipt:second" })
    if (!first.applied || !second.applied) throw new Error("fixture transition failed")

    expect(repository.save({ aggregate: first.aggregate, expectedRevision: 0 })).toEqual({ saved: true })
    expect(repository.save({ aggregate: second.aggregate, expectedRevision: 0 })).toEqual({ saved: false, reasonCode: "revision_conflict", currentRevision: 1 })
  })

  it("lists recoverable aggregates from canonical state instead of RootRun projection", () => {
    const repository = new SqliteCanonicalWorkRepository(openDb(), () => 1_000)
    const pending = createCanonicalWorkAggregate({ workId: "work:pending", rootRunId: "run:1" })
    repository.create(pending)
    createRootRun({ id: "run:2", sessionId: "session:1", prompt: "reported request", source: "webui" })
    openDb().prepare("DELETE FROM canonical_work_aggregates WHERE root_run_id = ?").run("run:2")
    let reported = createCanonicalWorkAggregate({ workId: "work:reported", rootRunId: "run:2" })
    repository.create(reported)
    for (const [event, receiptRef] of [
      ["DIAGNOSIS_ACCEPTED", "receipt:diagnosis"],
      ["POLICY_ALLOWED", "receipt:policy"],
      ["EXECUTION_STARTED", "receipt:execution"],
      ["ATTEMPT_RECORDED", "receipt:attempt"],
      ["ALL_CRITERIA_VERIFIED", "receipt:verification"],
      ["REPORT_DELIVERED", "receipt:delivery"],
    ] as const) {
      const applied = applyCanonicalWorkEvent({
        aggregate: reported,
        expectedRevision: reported.revision,
        event,
        receiptRef,
      })
      if (!applied.applied) throw new Error("fixture transition failed")
      expect(repository.save({ aggregate: applied.aggregate, expectedRevision: reported.revision })).toEqual({ saved: true })
      reported = applied.aggregate
    }

    expect(repository.listRecoverable(10)).toEqual([pending])
  })

  it("fails closed when persisted transition history is corrupt", () => {
    const repository = new SqliteCanonicalWorkRepository(openDb(), () => 1_000)
    repository.create(createCanonicalWorkAggregate({ workId: "work:1", rootRunId: "run:1" }))
    openDb().prepare("UPDATE canonical_work_aggregates SET transitions_json = ? WHERE work_id = ?").run("{broken", "work:1")
    expect(() => repository.load("work:1")).toThrow(CanonicalWorkPersistenceCorruptionError)

    openDb().prepare("UPDATE canonical_work_aggregates SET state = ?, transitions_json = ? WHERE work_id = ?").run("EXECUTING", "[]", "work:1")
    expect(() => repository.load("work:1")).toThrow(CanonicalWorkPersistenceCorruptionError)
  })
})
