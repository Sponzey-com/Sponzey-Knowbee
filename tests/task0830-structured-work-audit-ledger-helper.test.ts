import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
} from "../packages/core/src/db/index.js"
import {
  auditWorkRecordStatusTransition,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import {
  buildStructuredWorkAuditPayload,
  recordStructuredWorkAuditEventSafely,
} from "../packages/core/src/orchestration/structured-work-audit-ledger.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function workRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "completed",
    user_request_summary: "Create a short plan.",
    request_diagnosis: {
      diagnosis_summary: "The user asked for a plan.",
      intent: "plan_request",
      goal: "Create a short plan.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "Planning is directly requested.",
    },
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "마당쇠",
      action_type: "plan",
      input_refs: ["user-request"],
      expected_output: "A concise plan.",
      completion_criteria: "The plan has ordered steps.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "result-1",
      evidence_refs: ["plan-draft"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The plan satisfies the request.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The result meets the completion criteria.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "All required steps are complete.",
    },
    ...overrides,
  }
}

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0830-work-audit-ledger-"))
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

describe("task0830 structured work audit ledger helper", () => {
  it("keeps transition development log detail in audit payloads", () => {
    const audit = auditWorkRecordStatusTransition(workRecord(), "running")
    const payload = buildStructuredWorkAuditPayload(audit)

    expect(payload).toMatchObject({
      auditKind: "status_transition",
      status: "invalid",
      reasonCode: "transition_not_allowed",
      productLogEnabled: false,
      developmentLog: {
        level: "dev",
        transition: {
          fromStatus: "completed",
          toStatus: "running",
          reasonCode: "transition_not_allowed",
        },
      },
    })
  })

  it("records invalid status transition audits as structured_work_audit ledger events", () => {
    const audit = auditWorkRecordStatusTransition(workRecord(), "running")

    const result = recordStructuredWorkAuditEventSafely({
      audit,
      runId: "run-task0830",
      stage: "status_transition",
      source: "task0830-test",
      dedupeKey: "task0830:status-transition:run-task0830:work-1",
      payload: {
        workId: "work-1",
        toStatus: "running",
      },
    })

    expect(result).toEqual({ recorded: true })
    const event = listOrchestrationEventLedger({
      runId: "run-task0830",
      eventKind: "structured_work_audit",
    })[0]
    expect(event).toMatchObject({
      eventKind: "structured_work_audit",
      severity: "warning",
      source: "task0830-test",
    })
    expect(event?.payload).toMatchObject({
      stage: "status_transition",
      workId: "work-1",
      toStatus: "running",
      status: "invalid",
      developmentLog: {
        transition: {
          fromStatus: "completed",
          toStatus: "running",
          reasonCode: "transition_not_allowed",
        },
      },
    })
  })
})
