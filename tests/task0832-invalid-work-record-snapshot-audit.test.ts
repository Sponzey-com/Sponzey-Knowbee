import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import type { WorkHandoffPackage } from "../packages/core/src/contracts/index.ts"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import { recordRuntimeWorkRecordSnapshotSafely } from "../packages/core/src/orchestration/work-record-snapshot-ledger.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0832-invalid-snapshot-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0832 invalid work record snapshot audit", () => {
  it("records invalid snapshot attempts as structured audit without storing the raw record", () => {
    const result = recordRuntimeWorkRecordSnapshotSafely({
      snapshotKind: "work_handoff_package",
      stage: "pre_dispatch_handoff",
      record: {
        schemaVersion: 1,
        work_id: "",
      } as WorkHandoffPackage,
      parentRunId: "run-task0832",
      subSessionId: "sub-session-task0832",
      agentId: "agent-task0832",
      taskId: "task-task0832",
      source: "task0832-test",
    })

    expect(result.recorded).toBe(false)
    expect(result.reasonCode).toBe("invalid_snapshot")
    expect(result.validationIssues?.length).toBeGreaterThan(0)
    expect(listOrchestrationEventLedger({
      runId: "run-task0832",
      eventKind: "work_record_snapshot",
    })).toHaveLength(0)

    const audit = listOrchestrationEventLedger({
      runId: "run-task0832",
      eventKind: "structured_work_audit",
    })[0]
    expect(audit).toMatchObject({
      eventKind: "structured_work_audit",
      severity: "warning",
      source: "task0832-test",
    })
    expect(audit?.payload).toMatchObject({
      stage: "pre_dispatch_handoff",
      snapshotKind: "work_handoff_package",
      validationStatus: "invalid",
      issuePaths: expect.arrayContaining(["$.work_id"]),
    })
    expect(audit?.payload).not.toHaveProperty("record")
  })
})
