import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import {
  applyCanonicalRunTransition,
  createRootRun,
  getRootRun,
} from "../packages/core/src/runs/store.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { SqliteCanonicalWorkReceiptRepository } from "../packages/core/src/db/canonical-work-receipt-repository.ts"
import type { CanonicalWorkReceiptKind } from "../packages/core/src/contracts/canonical-work-receipt.ts"
import { canonicalWorkIdForRootRun } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { SqliteTypedObservabilityEventRepository } from "../packages/core/src/db/typed-observability-event-repository.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

function db() { return getDb({ paths }) }
function aggregate() {
  return new SqliteCanonicalWorkRepository(db(), () => 1).load(canonicalWorkIdForRootRun("run:1"))
}
function issue(receiptId: string, kind: CanonicalWorkReceiptKind) {
  return new SqliteCanonicalWorkReceiptRepository(db(), () => 1).issue({
    receiptId,
    workId: canonicalWorkIdForRootRun("run:1"),
    kind,
    evidenceFingerprint: `sha256:${"b".repeat(64)}`,
    evidenceRefs: [`evidence:${receiptId}`],
  })
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-canonical-transition-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  db()
  const now = Date.now()
  insertSession({ id: "session:1", source: "webui", source_id: "user:1", created_at: now, updated_at: now, summary: "test" })
  createRootRun({ id: "run:1", sessionId: "session:1", prompt: "request", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("canonical run transition store", () => {
  it("records a bounded request-received event when the RootRun is created", () => {
    const events = new SqliteTypedObservabilityEventRepository()
      .list({ requestId: "run:1" })
      .events

    expect(events).toMatchObject([
      {
        kind: "request_received",
        purpose: "product",
        reasonCode: "request_received",
        correlation: {
          requestId: "run:1",
          requestGroupId: "run:1",
          rootRunId: "run:1",
          runId: "run:1",
          workId: "work:root:run:1",
        },
      },
    ])
    expect(events[0]?.attributes).toBeUndefined()
    expect(JSON.stringify(events)).not.toMatch(/prompt|rawPayload|modelResponse/)
  })

  it("atomically applies the canonical event and its RootRun projection", () => {
    issue("receipt:diagnosis:1", "diagnosis")
    expect(applyCanonicalRunTransition({
      runId: "run:1",
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis:1",
    })).toMatchObject({ status: "applied", aggregate: { state: "SOLUTION_ANALYZED", revision: 1 }, run: { status: "running" } })
    expect(aggregate()).toMatchObject({ state: "SOLUTION_ANALYZED", revision: 1 })
    expect(getRootRun("run:1")?.status).toBe("running")
    expect(new SqliteTypedObservabilityEventRepository().list({ requestId: "run:1" }).events).toMatchObject([
      { kind: "request_received", reasonCode: "request_received" },
      { kind: "analysis_completed", reasonCode: "diagnosis_accepted" },
    ])
  })

  it("leaves both stores unchanged for invalid, stale, or projection-incomplete commands", () => {
    issue("receipt:invalid", "execution")
    issue("receipt:stale", "diagnosis")
    issue("receipt:input", "input_requirement")
    expect(applyCanonicalRunTransition({ runId: "run:1", expectedRevision: 0, event: "EXECUTION_STARTED", receiptRef: "receipt:invalid" })).toMatchObject({ status: "rejected", reasonCode: "transition_not_allowed" })
    expect(applyCanonicalRunTransition({ runId: "run:1", expectedRevision: 1, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:stale" })).toMatchObject({ status: "rejected", reasonCode: "stale_revision" })
    expect(applyCanonicalRunTransition({ runId: "run:1", expectedRevision: 0, event: "INPUT_REQUIRED", receiptRef: "receipt:input" })).toEqual({ status: "rejected", reasonCode: "waiting_kind_required" })
    expect(aggregate()).toMatchObject({ state: "REQUEST_RECEIVED", revision: 0 })
    expect(getRootRun("run:1")?.status).toBe("queued")
  })

  it("rolls back the canonical CAS when the RootRun projection update fails", () => {
    issue("receipt:diagnosis:1", "diagnosis")
    db().exec(`
      CREATE TRIGGER reject_root_projection
      BEFORE UPDATE OF status ON root_runs
      WHEN OLD.id = 'run:1'
      BEGIN
        SELECT RAISE(ABORT, 'forced projection failure');
      END;
    `)
    expect(applyCanonicalRunTransition({
      runId: "run:1",
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis:1",
    })).toEqual({ status: "persistence_failed", reasonCode: "canonical_run_transition_persistence_failed" })
    expect(aggregate()).toMatchObject({ state: "REQUEST_RECEIVED", revision: 0 })
    expect(getRootRun("run:1")?.status).toBe("queued")
  })
})
