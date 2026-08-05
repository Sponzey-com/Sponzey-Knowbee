import { describe, expect, it } from "vitest"
import {
  applyAuditedWorkRecordStatusTransition,
  canTransitionWorkRecordStatus,
  decideWorkRecordRecoveryReentry,
  validateWorkRecord,
  type RecoveryCandidate,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

const recovery: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "Use the secondary tool.",
  expected_benefit: "Avoid the failed primary tool.",
  risk: "low",
  changed_dimensions: ["tool"],
  metadata: { tool: "secondary" },
}

function failedRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "failed",
    user_request_summary: "Verify the repository.",
    request_diagnosis: {
      diagnosis_summary: "Verification is requested.",
      intent: "verify",
      goal: "Verify the repository.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "use_tool",
      reason: "Evidence requires a tool.",
    },
    step_plan: [{
      step_id: "verify",
      owner_agent_name: "마당쇠",
      action_type: "use_tool",
      input_refs: ["request:1"],
      expected_output: "Verification evidence.",
      completion_criteria: "Evidence is available.",
      status: "failed",
    }],
    step_results: [{
      step_id: "verify",
      status: "failed",
      evidence_refs: ["evidence:failure"],
      error: "primary_tool_failed",
    }],
    result_diagnosis: {
      diagnosis_summary: "Verification failed but can retry.",
      sufficiency: "insufficient",
      missing_information: [],
      conflicts: [],
      risk: "low",
      risks: [],
      confidence: "high",
      recommended_action: "retry",
      reason: "A changed tool can recover.",
    },
    failure_diagnosis: {
      failed_step_id: "verify",
      failure_reason: "primary_tool_failed",
      failed_input_refs: ["request:1"],
      failed_strategy: "Use the primary tool.",
      recoverable: true,
    },
    recovery_candidates: [recovery],
    selected_recovery_action: recovery,
    retry_count: 0,
    retry_limit: 2,
    stop_condition: "Stop after the retry limit.",
    action_decision: { selected_action: "retry", reason: "Use the selected recovery." },
    ...overrides,
  }
}

function blockedRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  const base = failedRecord()
  return {
    ...base,
    status: "blocked",
    result_diagnosis: {
      ...base.result_diagnosis,
      diagnosis_summary: "Permission blocks verification.",
      recommended_action: "stop_blocked",
      reason: "Permission must be resolved.",
    },
    action_decision: { selected_action: "stop_blocked", reason: "Wait for permission." },
    active_blocker: {
      blocker_kind: "permission",
      blocker_ref: "permission:repository-read",
      step_id: "verify",
      evidence_refs: ["evidence:permission-denied"],
    },
    ...overrides,
  }
}

describe("task1277 failed recovery re-entry", () => {
  it("allows planned re-entry with the exact selected changed candidate", () => {
    const record = failedRecord()
    expect(validateWorkRecord(record).ok).toBe(true)
    expect(decideWorkRecordRecoveryReentry(record)).toEqual({
      status: "resume_planned",
      reasonCode: "changed_recovery_selected",
      targetStatus: "planned",
      selectedRecoveryAction: recovery,
    })
    expect(applyAuditedWorkRecordStatusTransition(record, "planned")).toMatchObject({
      ok: true,
      changed: true,
      record: { status: "planned" },
    })

    const metadataMismatch = failedRecord({
      selected_recovery_action: { ...recovery, metadata: { tool: "different" } },
    })
    expect(canTransitionWorkRecordStatus(metadataMismatch, "planned")).toMatchObject({
      ok: false,
      reasonCode: "recovery_action_invalid",
    })
  })

  it.each([2, 3])("treats retry_count=%s as a reassessment signal instead of a terminal guard", (retryCount) => {
    const original = failedRecord({ retry_count: retryCount, retry_limit: 2 })
    const snapshot = structuredClone(original)
    expect(decideWorkRecordRecoveryReentry(original)).toEqual({
      status: "resume_planned",
      reasonCode: "changed_recovery_selected",
      targetStatus: "planned",
      selectedRecoveryAction: recovery,
    })
    expect(canTransitionWorkRecordStatus(original, "planned")).toEqual({ ok: true })
    expect(original).toEqual(snapshot)
  })

  it("does not turn a verified partial result into a report only because retry count reached a limit", () => {
    const original = failedRecord({
      retry_count: 2,
      retry_limit: 2,
      step_plan: [
        { ...failedRecord().step_plan[0], step_id: "collect", status: "completed" },
        { ...failedRecord().step_plan[0], step_id: "verify", status: "failed" },
      ],
      step_results: [
        {
          step_id: "collect",
          status: "completed",
          output_ref: "result:partial-evidence",
          evidence_refs: ["evidence:partial-verified"],
          completed_at: 1,
        },
        failedRecord().step_results[0],
      ],
    })
    expect(decideWorkRecordRecoveryReentry(original)).toEqual({
      status: "resume_planned",
      reasonCode: "changed_recovery_selected",
      targetStatus: "planned",
      selectedRecoveryAction: recovery,
    })
  })
})

describe("task1277 blocked recovery re-entry", () => {
  it("requires a verified resolution linked to the exact work and blocker", () => {
    const blocked = blockedRecord({
      blocker_resolution: {
        receipt_id: "resolution-1",
        work_id: "work-1",
        blocker_kind: "permission",
        blocker_ref: "permission:repository-read",
        resolution_evidence_refs: ["evidence:permission-granted"],
        verified: true,
      },
    })
    expect(validateWorkRecord(blocked).ok).toBe(true)
    expect(decideWorkRecordRecoveryReentry(blocked)).toEqual({
      status: "resume_planned",
      reasonCode: "blocker_resolved",
      targetStatus: "planned",
      resolutionReceiptId: "resolution-1",
    })
    expect(canTransitionWorkRecordStatus(blocked, "planned")).toEqual({ ok: true })
  })

  it.each([
    ["legacy text only", { unblock_evidence: ["Permission granted."] }],
    ["wrong work", { blocker_resolution: { receipt_id: "r", work_id: "other", blocker_kind: "permission", blocker_ref: "permission:repository-read", resolution_evidence_refs: ["evidence:x"], verified: true } }],
    ["wrong blocker", { blocker_resolution: { receipt_id: "r", work_id: "work-1", blocker_kind: "resource", blocker_ref: "resource:other", resolution_evidence_refs: ["evidence:x"], verified: true } }],
    ["unverified", { blocker_resolution: { receipt_id: "r", work_id: "work-1", blocker_kind: "permission", blocker_ref: "permission:repository-read", resolution_evidence_refs: ["evidence:x"], verified: false } }],
  ])("rejects %s resolution without mutating the record", (_label, override) => {
    const blocked = blockedRecord(override as Partial<WorkRecord>)
    const snapshot = structuredClone(blocked)
    expect(decideWorkRecordRecoveryReentry(blocked)).toMatchObject({
      status: "stay_blocked",
      reasonCode: "blocker_resolution_required",
    })
    expect(canTransitionWorkRecordStatus(blocked, "planned")).toMatchObject({
      ok: false,
      reasonCode: "blocker_resolution_required",
    })
    expect(blocked).toEqual(snapshot)
  })
})
