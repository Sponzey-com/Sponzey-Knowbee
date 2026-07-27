import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { canonicalWorkIdForRootRun } from "../packages/core/src/contracts/canonical-work-aggregate.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function db() {
  return getDb({ paths })
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-root-ingress-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  db()
  const now = Date.now()
  insertSession({ id: "session:1", source: "webui", source_id: "user:1", created_at: now, updated_at: now, summary: "test" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("canonical root ingress", () => {
  it("creates a deterministic REQUEST_RECEIVED aggregate with every root run", () => {
    createRootRun({ id: "run:root:1", sessionId: "session:1", prompt: "root request", source: "webui" })
    const workId = canonicalWorkIdForRootRun("run:root:1")
    expect(workId).toBe("work:root:run:root:1")
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(workId)).toEqual({
      workId,
      rootRunId: "run:root:1",
      state: "REQUEST_RECEIVED",
      revision: 0,
      transitions: [],
    })
  })

  it("does not create a separate root aggregate for child or analysis runs", () => {
    createRootRun({ id: "run:root", sessionId: "session:1", prompt: "root", source: "webui" })
    createRootRun({ id: "run:child", sessionId: "session:1", parentRunId: "run:root", runScope: "child", prompt: "child", source: "webui" })
    createRootRun({ id: "run:analysis", sessionId: "session:1", parentRunId: "run:root", runScope: "analysis", prompt: "analysis", source: "webui" })
    const repository = new SqliteCanonicalWorkRepository(db(), () => 1)
    expect(repository.load(canonicalWorkIdForRootRun("run:child"))).toBeUndefined()
    expect(repository.load(canonicalWorkIdForRootRun("run:analysis"))).toBeUndefined()
  })

  it("rolls back the root row, steps, and events when canonical creation fails", () => {
    db().exec(`
      CREATE TRIGGER reject_canonical_root_insert
      BEFORE INSERT ON canonical_work_aggregates
      BEGIN
        SELECT RAISE(ABORT, 'forced canonical insert failure');
      END;
    `)
    expect(() => createRootRun({ id: "run:rollback", sessionId: "session:1", prompt: "rollback", source: "webui" })).toThrow(/forced canonical insert failure/i)
    expect((db().prepare("SELECT COUNT(*) AS count FROM root_runs WHERE id = ?").get("run:rollback") as { count: number }).count).toBe(0)
    expect((db().prepare("SELECT COUNT(*) AS count FROM run_steps WHERE run_id = ?").get("run:rollback") as { count: number }).count).toBe(0)
    expect((db().prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?").get("run:rollback") as { count: number }).count).toBe(0)
  })
})
