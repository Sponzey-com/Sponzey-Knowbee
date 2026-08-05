import type { ContractValidationIssue } from "../contracts/index.js"
import {
  type ChildWorkResult,
  type WorkHandoffPackage,
  validateChildWorkResult,
  validateWorkHandoffPackage,
} from "../contracts/work-record.js"
import { recordOrchestrationEvent } from "./event-ledger.js"

export type WorkRecordSnapshotKind = "work_handoff_package" | "child_work_result"
export type WorkRecordSnapshotStage = "pre_dispatch_handoff" | "post_review_child_result"
export type WorkRecordSnapshotValidationStatus = "valid"

export type RuntimeWorkRecordSnapshotInput =
  | {
      snapshotKind: "work_handoff_package"
      stage: "pre_dispatch_handoff"
      record: WorkHandoffPackage
      parentRunId: string
      subSessionId: string
      agentId: string
      taskId: string
      source: string
    }
  | {
      snapshotKind: "child_work_result"
      stage: "post_review_child_result"
      record: ChildWorkResult
      parentRunId: string
      subSessionId: string
      agentId: string
      resultReportId: string
      source: string
    }

export interface RuntimeWorkRecordSnapshotResult {
  recorded: boolean
  reasonCode?: "invalid_snapshot" | "ledger_write_failed"
  validationIssues?: ContractValidationIssue[]
}

function validateSnapshot(input: RuntimeWorkRecordSnapshotInput): {
  ok: true
  record: WorkHandoffPackage | ChildWorkResult
} | {
  ok: false
  issues: ContractValidationIssue[]
} {
  if (input.snapshotKind === "work_handoff_package") {
    const validation = validateWorkHandoffPackage(input.record)
    return validation.ok
      ? { ok: true, record: validation.value }
      : { ok: false, issues: validation.issues }
  }
  const validation = validateChildWorkResult(input.record)
  return validation.ok
    ? { ok: true, record: validation.value }
    : { ok: false, issues: validation.issues }
}

function snapshotDedupeKey(input: RuntimeWorkRecordSnapshotInput): string {
  return [
    "orchestration:work-record-snapshot",
    input.stage,
    input.parentRunId,
    input.subSessionId,
    input.snapshotKind,
    input.snapshotKind === "work_handoff_package" ? input.taskId : input.resultReportId,
  ].join(":")
}

function snapshotSummary(input: RuntimeWorkRecordSnapshotInput): string {
  return input.snapshotKind === "work_handoff_package"
    ? "Validated work handoff package snapshot recorded."
    : "Validated child work result snapshot recorded."
}

function invalidSnapshotSummary(input: RuntimeWorkRecordSnapshotInput): string {
  return input.snapshotKind === "work_handoff_package"
    ? "Invalid work handoff package snapshot rejected."
    : "Invalid child work result snapshot rejected."
}

function parentWorkIdFor(input: RuntimeWorkRecordSnapshotInput): string | null {
  if (input.snapshotKind === "work_handoff_package") return input.record.parent_work_id
  return null
}

function snapshotReference(input: RuntimeWorkRecordSnapshotInput): string {
  return input.snapshotKind === "work_handoff_package" ? input.taskId : input.resultReportId
}

function recordInvalidSnapshotAuditSafely(
  input: RuntimeWorkRecordSnapshotInput,
  issues: ContractValidationIssue[],
): void {
  try {
    recordOrchestrationEvent({
      eventKind: "structured_work_audit",
      runId: input.parentRunId,
      subSessionId: input.subSessionId,
      agentId: input.agentId,
      correlationId: input.parentRunId,
      dedupeKey: [
        "orchestration:work-record-snapshot-invalid",
        input.stage,
        input.parentRunId,
        input.subSessionId,
        input.snapshotKind,
        snapshotReference(input),
      ].join(":"),
      source: input.source,
      severity: "warning",
      summary: invalidSnapshotSummary(input),
      payload: {
        stage: input.stage,
        snapshotKind: input.snapshotKind,
        validationStatus: "invalid",
        issueCount: issues.length,
        issuePaths: [...new Set(issues.map((issue) => issue.path))],
        validationIssues: issues,
      },
    })
  } catch {
    // Invalid snapshot audits are diagnostic-only and must not affect runtime behavior.
  }
}

export function recordRuntimeWorkRecordSnapshotSafely(
  input: RuntimeWorkRecordSnapshotInput,
): RuntimeWorkRecordSnapshotResult {
  const validation = validateSnapshot(input)
  if (!validation.ok) {
    recordInvalidSnapshotAuditSafely(input, validation.issues)
    return {
      recorded: false,
      reasonCode: "invalid_snapshot",
      validationIssues: validation.issues,
    }
  }

  try {
    const event = recordOrchestrationEvent({
      eventKind: "work_record_snapshot",
      runId: input.parentRunId,
      subSessionId: input.subSessionId,
      agentId: input.agentId,
      correlationId: input.parentRunId,
      dedupeKey: snapshotDedupeKey(input),
      source: input.source,
      severity: "debug",
      summary: snapshotSummary(input),
      payload: {
        snapshotKind: input.snapshotKind,
        stage: input.stage,
        workId: validation.record.work_id,
        parentWorkId: parentWorkIdFor(input),
        validationStatus: "valid" satisfies WorkRecordSnapshotValidationStatus,
        record: validation.record,
      },
    })
    return {
      recorded: event !== null,
      ...(event === null ? { reasonCode: "ledger_write_failed" as const } : {}),
    }
  } catch {
    return {
      recorded: false,
      reasonCode: "ledger_write_failed",
    }
  }
}
