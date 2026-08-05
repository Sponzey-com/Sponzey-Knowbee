import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  WORK_RECORD_STATUS_TRANSITIONS,
  applyAuditedWorkRecordStatusTransition,
  canTransitionWorkRecordStatus,
  isDeclaredWorkRecordStatusTransition,
  type WorkRecord,
  type WorkRecordStatus,
} from "../packages/core/src/contracts/index.ts"

const statuses: WorkRecordStatus[] = [
  "intake",
  "planned",
  "running",
  "waiting",
  "completed",
  "partial",
  "blocked",
  "failed",
  "cancelled",
]

const expectedTransitions: Readonly<Record<WorkRecordStatus, readonly WorkRecordStatus[]>> = {
  intake: ["planned", "blocked"],
  planned: ["running", "waiting", "cancelled"],
  running: ["waiting", "completed", "partial", "failed", "blocked"],
  waiting: ["running", "cancelled"],
  completed: [],
  partial: ["planned", "completed"],
  failed: ["planned", "blocked"],
  blocked: ["planned", "cancelled"],
  cancelled: [],
}

function record(status: WorkRecordStatus): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: `work-${status}`,
    owner_agent_name: "마당쇠",
    source: "user",
    status,
    user_request_summary: "Create a plan.",
    request_diagnosis: {
      diagnosis_summary: "Planning is requested.",
      intent: "plan",
      goal: "Create a plan.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The request requires a plan.",
    },
    step_plan: [{
      step_id: "plan",
      owner_agent_name: "마당쇠",
      action_type: "plan",
      input_refs: ["request:1"],
      expected_output: "A plan.",
      completion_criteria: "The plan has ordered steps.",
      status: "completed",
    }],
    step_results: [{
      step_id: "plan",
      status: "completed",
      output_ref: "result:plan",
      evidence_refs: ["evidence:plan"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The plan is sufficient.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The completion criterion is met.",
    },
    retry_count: 0,
    retry_limit: 1,
    action_decision: { selected_action: "final_report", reason: "Return the result." },
  }
}

describe("task1276 canonical WorkRecord status graph", () => {
  it("matches the GOAL 7.2 transition table for every status pair", () => {
    expect(WORK_RECORD_STATUS_TRANSITIONS).toEqual(expectedTransitions)
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isDeclaredWorkRecordStatusTransition(from, to), `${from} -> ${to}`).toBe(
          expectedTransitions[from].includes(to),
        )
      }
    }
  })

  it("cannot be changed by a runtime consumer", () => {
    expect(Object.isFrozen(WORK_RECORD_STATUS_TRANSITIONS)).toBe(true)
    for (const status of statuses) {
      expect(Object.isFrozen(WORK_RECORD_STATUS_TRANSITIONS[status])).toBe(true)
    }
    expect(() => {
      (WORK_RECORD_STATUS_TRANSITIONS.completed as WorkRecordStatus[]).push("running")
    }).toThrow()
    expect(isDeclaredWorkRecordStatusTransition("completed", "running")).toBe(false)
  })

  it.each(["completed", "cancelled"] as const)(
    "keeps terminal %s records immutable for every attempted target",
    (terminal) => {
      for (const target of statuses) {
        const original = record(terminal)
        const snapshot = structuredClone(original)
        const decision = canTransitionWorkRecordStatus(original, target)
        const application = applyAuditedWorkRecordStatusTransition(original, target)

        expect(decision).toMatchObject({ ok: false, reasonCode: "transition_not_allowed" })
        expect(application).toMatchObject({
          ok: false,
          changed: false,
          record: original,
          transition: { reasonCode: "transition_not_allowed" },
          audit: {
            productLog: { enabled: false },
            developmentLog: {
              level: "dev",
              transition: {
                fromStatus: terminal,
                toStatus: target,
                reasonCode: "transition_not_allowed",
              },
            },
          },
        })
        expect(original).toEqual(snapshot)
      }
    },
  )

  it("keeps the domain graph independent from logger, persistence, and adapters", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/work-record.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:better-sqlite3|node:fs|node:http|node:net|\.\.\/logger|\.\.\/db|\.\.\/orchestration)/)
  })
})
