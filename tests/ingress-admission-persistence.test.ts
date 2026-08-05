import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { reserveIngressAdmission } from "../packages/core/src/runs/message-ledger.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let rootDir = ""

beforeEach(() => {
  closeDb()
  rootDir = mkdtempSync(join(tmpdir(), "knowbee-ingress-admission-"))
  const fixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(fixture.paths.stateDir)
})

afterEach(() => {
  closeDb()
  if (rootDir) rmSync(rootDir, { recursive: true, force: true })
})

describe("Ingress admission persistence", () => {
  it("atomically preserves the first run for a transport idempotency key", () => {
    const input = {
      idempotencyKey: "ingress-request:telegram:session:chat:main:401",
      sessionId: "session",
      source: "telegram",
    }

    expect(reserveIngressAdmission({ ...input, runId: "run-first" })).toEqual({
      status: "admitted",
    })
    expect(reserveIngressAdmission({ ...input, runId: "run-second" })).toEqual({
      status: "existing",
      runId: "run-first",
    })

    const events = listMessageLedgerEvents({ requestGroupId: "run-first" })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      run_id: "run-first",
      event_kind: "ingress_admission_reserved",
      idempotency_key: input.idempotencyKey,
      status: "started",
    })
    expect(events[0]?.detail_json).toBeNull()
  })
})
