import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { recordMessageLedgerEvent } from "../packages/core/src/runs/message-ledger.ts"
import {
  createRootRun,
  getRequestExecutionOutcome,
} from "../packages/core/src/runs/store.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-request-outcome-"))
  paths = createRuntimePaths(
    { KNOWBEE_STATE_DIR: root },
    { homeDir: root, exists: () => false },
  )
  getDb({ paths })
  insertSession({
    id: "session:outcome",
    source: "webui",
    source_id: "user:outcome",
    created_at: 1,
    updated_at: 1,
    summary: "test",
  })
  createRootRun({
    id: "run:outcome",
    sessionId: "session:outcome",
    prompt: "request",
    source: "webui",
  })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("stored request execution outcome", () => {
  it("reads canonical progress and the latest final delivery attempt", () => {
    expect(getRequestExecutionOutcome("run:outcome")).toEqual({
      executionStatus: "in_progress",
      deliveryStatus: "not_started",
    })

    recordMessageLedgerEvent({
      runId: "run:outcome",
      eventKind: "final_answer_generated",
      deliveryKind: "final",
      deliveryKey: "delivery:outcome",
      idempotencyKey: "delivery:outcome",
      status: "generated",
      summary: "generated",
    })
    expect(getRequestExecutionOutcome("run:outcome")?.deliveryStatus).toBe("pending")

    recordMessageLedgerEvent({
      runId: "run:outcome",
      eventKind: "text_delivery_failed",
      deliveryKind: "final",
      deliveryKey: "delivery:outcome",
      idempotencyKey: "delivery:outcome:failed",
      status: "failed",
      summary: "failed",
    })
    expect(getRequestExecutionOutcome("run:outcome")?.deliveryStatus).toBe("failed")
  })
})
