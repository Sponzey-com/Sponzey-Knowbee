import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import type { WorkRecordContinuityRecoveryAcceptance } from "../packages/core/src/contracts/index.ts"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import { recordWorkRecordContinuityRecoverySafely } from "../packages/core/src/orchestration/structured-work-audit-ledger.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1283-continuity-ledger-"))
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

function write(acceptance: WorkRecordContinuityRecoveryAcceptance, suffix: string): void {
  expect(recordWorkRecordContinuityRecoverySafely({
    acceptance,
    workId: "work-parent",
    runId: "run-1283",
    source: "task1283-test",
    dedupeKey: `task1283:${suffix}`,
  })).toEqual({ recorded: true })
}

describe("task1283 WorkRecord continuity runtime ledger", () => {
  it("records lineage, transition, evidence, and recovery signature without the accepted record", () => {
    write({
      status: "accepted",
      parentWorkId: "work-parent",
      childWorkId: "work-child",
      parentStepId: "review",
      targetAgentName: "검토자",
      transition: { fromStatus: "running", toStatus: "failed" },
      evidenceRefs: ["evidence:failure"],
      recovery: {
        action: "retry",
        targetStatus: "planned",
        signature: "recovery-signature",
        changedDimensions: ["tool"],
      },
      record: { private: "raw parent and child payload" } as never,
    }, "accepted")

    const event = listOrchestrationEventLedger({ runId: "run-1283", eventKind: "structured_work_audit" })[0]
    expect(event?.payload).toMatchObject({
      stage: "continuity_recovery",
      status: "accepted",
      parentWorkId: "work-parent",
      childWorkId: "work-child",
      transition: { fromStatus: "running", toStatus: "failed" },
      recovery: { action: "retry", signature: "recovery-signature", changedDimensions: ["tool"] },
    })
    expect(JSON.stringify(event?.payload)).not.toContain("raw parent and child payload")
    expect(JSON.stringify(event?.payload)).not.toContain("private")
  })

  it("records only stable rejection reason and issue paths", () => {
    write({
      status: "rejected",
      reasonCode: "linkage_mismatch",
      issuePaths: ["$.childResult"],
    }, "rejected")
    const event = listOrchestrationEventLedger({ runId: "run-1283", eventKind: "structured_work_audit" })[0]
    expect(event).toMatchObject({ severity: "warning" })
    expect(event?.payload).toMatchObject({
      stage: "continuity_recovery",
      status: "rejected",
      reasonCode: "linkage_mismatch",
      issuePaths: ["$.childResult"],
    })
  })
})
