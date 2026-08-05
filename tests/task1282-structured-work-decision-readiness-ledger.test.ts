import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import type { StructuredWorkDecisionReadiness } from "../packages/core/src/contracts/index.ts"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import { recordStructuredWorkDecisionReadinessSafely } from "../packages/core/src/orchestration/structured-work-audit-ledger.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1282-readiness-ledger-"))
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

function record(readiness: StructuredWorkDecisionReadiness, suffix: string): void {
  expect(recordStructuredWorkDecisionReadinessSafely({
    readiness,
    workId: "work-1282",
    runId: "run-1282",
    source: "task1282-test",
    dedupeKey: `task1282:${suffix}`,
    agentId: "agent:knowbee",
  })).toEqual({ recorded: true })
}

describe("task1282 structured work readiness runtime ledger", () => {
  it("records structured readiness receipts without raw state", () => {
    record({
      status: "ready",
      workId: "work-1282",
      phase: "result",
      classification: "complex",
      stepIds: ["inspect", "verify"],
      diagnosisReceiptId: "receipt:result",
      selectedAction: "final_report",
    }, "ready")

    const event = listOrchestrationEventLedger({ runId: "run-1282", eventKind: "structured_work_audit" })[0]
    expect(event).toMatchObject({ severity: "debug", source: "task1282-test" })
    expect(event?.payload).toMatchObject({
      stage: "decision_readiness",
      workId: "work-1282",
      status: "ready",
      classification: "complex",
      diagnosisReceiptId: "receipt:result",
      selectedAction: "final_report",
    })
  })

  it("records only rejection codes and paths, not invalid raw values or messages", () => {
    record({
      status: "rejected",
      issues: [{
        code: "work_record_schema_invalid",
        path: "$.workRecord",
        validationIssues: [{
          path: "$.hidden_state",
          code: "contract_validation_failed",
          message: "Invalid raw value: private raw prose.",
        }],
      }],
    }, "rejected")

    const event = listOrchestrationEventLedger({ runId: "run-1282", eventKind: "structured_work_audit" })[0]
    expect(event).toMatchObject({ severity: "warning" })
    expect(event?.payload).toMatchObject({
      stage: "decision_readiness",
      status: "rejected",
      issues: [{
        code: "work_record_schema_invalid",
        path: "$.workRecord",
        validationIssues: [{ path: "$.hidden_state", code: "contract_validation_failed" }],
      }],
    })
    expect(JSON.stringify(event?.payload)).not.toContain("private raw prose")
    expect(JSON.stringify(event?.payload)).not.toContain("Invalid raw value")
  })
})
