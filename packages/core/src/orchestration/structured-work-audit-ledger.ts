import {
  applyAuditedWorkRecordStatusTransition,
  type AuditedWorkRecordStatusTransitionApplicationResult,
  type StructuredWorkAuditResult,
} from "../contracts/structured-work-audit.js"
import type {
  WorkRecord,
  WorkRecordStatus,
} from "../contracts/work-record.js"
import type { LlmDiagnosedActionFlowAcceptance } from "../contracts/llm-diagnosed-action-flow.js"
import type { StructuredWorkDecisionReadiness } from "../contracts/structured-work-decision-readiness.js"
import type { WorkRecordContinuityRecoveryAcceptance } from "../contracts/work-record-continuity-recovery.js"
import { recordOrchestrationEvent } from "./event-ledger.js"

export type StructuredWorkAuditLedgerStage =
  | "pre_dispatch_handoff"
  | "post_review_child_result"
  | "status_transition"
  | "diagnosed_action_flow"
  | "decision_readiness"
  | "continuity_recovery"

export interface StructuredWorkAuditLedgerInput {
  audit: StructuredWorkAuditResult<unknown>
  runId: string
  stage: StructuredWorkAuditLedgerStage
  source: string
  dedupeKey: string
  subSessionId?: string | undefined
  agentId?: string | undefined
  correlationId?: string | undefined
  payload?: Record<string, unknown> | undefined
}

export interface StructuredWorkAuditLedgerResult {
  recorded: boolean
  reasonCode?: "ledger_write_failed"
}

export interface AuditedWorkRecordTransitionLedgerInput {
  record: WorkRecord
  nextStatus: WorkRecordStatus
  runId: string
  source: string
  dedupeKey: string
  subSessionId?: string | undefined
  agentId?: string | undefined
  correlationId?: string | undefined
  payload?: Record<string, unknown> | undefined
}

export interface AuditedWorkRecordTransitionLedgerResult {
  application: AuditedWorkRecordStatusTransitionApplicationResult
  ledger: StructuredWorkAuditLedgerResult
}

export interface DiagnosedActionFlowLedgerInput {
  acceptance: LlmDiagnosedActionFlowAcceptance
  source: string
  dedupeKey: string
  agentId?: string | undefined
  correlationId?: string | undefined
}

export interface StructuredWorkDecisionReadinessLedgerInput {
  readiness: StructuredWorkDecisionReadiness
  workId: string
  runId: string
  source: string
  dedupeKey: string
  agentId?: string | undefined
  correlationId?: string | undefined
}

export interface WorkRecordContinuityRecoveryLedgerInput {
  acceptance: WorkRecordContinuityRecoveryAcceptance
  workId: string
  runId: string
  source: string
  dedupeKey: string
  agentId?: string | undefined
  correlationId?: string | undefined
}

export function buildStructuredWorkAuditPayload(
  audit: StructuredWorkAuditResult<unknown>,
): Record<string, unknown> {
  return {
    auditKind: audit.auditKind,
    status: audit.status,
    blocking: audit.blocking,
    reasonCode: audit.reasonCode ?? null,
    productLogEnabled: audit.productLog.enabled,
    fieldDebugLog: audit.fieldDebugLog,
    developmentLog: {
      level: audit.developmentLog.level,
      validationIssues: audit.developmentLog.validationIssues,
      ...(audit.developmentLog.transition ? { transition: audit.developmentLog.transition } : {}),
    },
  }
}

export function recordStructuredWorkAuditEventSafely(
  input: StructuredWorkAuditLedgerInput,
): StructuredWorkAuditLedgerResult {
  try {
    const event = recordOrchestrationEvent({
      eventKind: "structured_work_audit",
      runId: input.runId,
      ...(input.subSessionId ? { subSessionId: input.subSessionId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      correlationId: input.correlationId ?? input.runId,
      dedupeKey: input.dedupeKey,
      source: input.source,
      severity: input.audit.status === "invalid" ? "warning" : "debug",
      summary: input.audit.fieldDebugLog.summary,
      payload: {
        stage: input.stage,
        ...(input.payload ?? {}),
        ...buildStructuredWorkAuditPayload(input.audit),
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

export function applyAndRecordWorkRecordStatusTransitionSafely(
  input: AuditedWorkRecordTransitionLedgerInput,
): AuditedWorkRecordTransitionLedgerResult {
  const application = applyAuditedWorkRecordStatusTransition(input.record, input.nextStatus)
  const ledger = recordStructuredWorkAuditEventSafely({
    audit: application.audit,
    runId: input.runId,
    stage: "status_transition",
    source: input.source,
    dedupeKey: input.dedupeKey,
    ...(input.subSessionId ? { subSessionId: input.subSessionId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    payload: {
      workId: input.record.work_id,
      fromStatus: input.record.status,
      toStatus: input.nextStatus,
      ...(input.payload ?? {}),
    },
  })
  return { application, ledger }
}

export function recordDiagnosedActionFlowAcceptanceSafely(
  input: DiagnosedActionFlowLedgerInput,
): StructuredWorkAuditLedgerResult {
  try {
    const accepted = input.acceptance.status === "accepted"
    const event = recordOrchestrationEvent({
      eventKind: "structured_work_audit",
      runId: input.acceptance.runId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      correlationId: input.correlationId ?? input.acceptance.runId,
      dedupeKey: input.dedupeKey,
      source: input.source,
      severity: accepted ? "debug" : "warning",
      summary: accepted
        ? "LLM-diagnosed action flow accepted."
        : "LLM-diagnosed action flow rejected.",
      payload: {
        stage: "diagnosed_action_flow",
        workId: input.acceptance.workId,
        status: input.acceptance.status,
        ...(input.acceptance.status === "accepted"
          ? {
              requestReceiptId: input.acceptance.requestReceiptId,
              resultReceiptId: input.acceptance.resultReceiptId,
              selectedAction: input.acceptance.selectedAction,
              traceReasonCodes: input.acceptance.traceReasonCodes,
            }
          : { issueCodes: input.acceptance.issues.map((issue) => issue.code) }),
      },
    })
    return {
      recorded: event !== null,
      ...(event === null ? { reasonCode: "ledger_write_failed" as const } : {}),
    }
  } catch {
    return { recorded: false, reasonCode: "ledger_write_failed" }
  }
}

export function recordStructuredWorkDecisionReadinessSafely(
  input: StructuredWorkDecisionReadinessLedgerInput,
): StructuredWorkAuditLedgerResult {
  try {
    const ready = input.readiness.status === "ready"
    const event = recordOrchestrationEvent({
      eventKind: "structured_work_audit",
      runId: input.runId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      correlationId: input.correlationId ?? input.runId,
      dedupeKey: input.dedupeKey,
      source: input.source,
      severity: ready ? "debug" : "warning",
      summary: ready
        ? "Structured work decision readiness accepted."
        : "Structured work decision readiness rejected.",
      payload: {
        stage: "decision_readiness",
        workId: input.workId,
        status: input.readiness.status,
        ...(input.readiness.status === "ready"
          ? {
              phase: input.readiness.phase,
              classification: input.readiness.classification,
              stepIds: input.readiness.stepIds,
              diagnosisReceiptId: input.readiness.diagnosisReceiptId,
              selectedAction: input.readiness.selectedAction,
            }
          : {
              issues: input.readiness.issues.map((item) => ({
                code: item.code,
                ...(item.path ? { path: item.path } : {}),
                ...(item.validationIssues ? {
                  validationIssues: item.validationIssues.map((validationIssue) => ({
                    path: validationIssue.path,
                    code: validationIssue.code,
                  })),
                } : {}),
              })),
            }),
      },
    })
    return {
      recorded: event !== null,
      ...(event === null ? { reasonCode: "ledger_write_failed" as const } : {}),
    }
  } catch {
    return { recorded: false, reasonCode: "ledger_write_failed" }
  }
}

export function recordWorkRecordContinuityRecoverySafely(
  input: WorkRecordContinuityRecoveryLedgerInput,
): StructuredWorkAuditLedgerResult {
  try {
    const accepted = input.acceptance.status === "accepted"
    const event = recordOrchestrationEvent({
      eventKind: "structured_work_audit",
      runId: input.runId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      correlationId: input.correlationId ?? input.runId,
      dedupeKey: input.dedupeKey,
      source: input.source,
      severity: accepted ? "debug" : "warning",
      summary: accepted
        ? "WorkRecord continuity and recovery accepted."
        : "WorkRecord continuity and recovery rejected.",
      payload: {
        stage: "continuity_recovery",
        workId: input.workId,
        status: input.acceptance.status,
        ...(input.acceptance.status === "accepted"
          ? {
              parentWorkId: input.acceptance.parentWorkId,
              childWorkId: input.acceptance.childWorkId,
              parentStepId: input.acceptance.parentStepId,
              targetAgentName: input.acceptance.targetAgentName,
              transition: input.acceptance.transition,
              evidenceRefs: input.acceptance.evidenceRefs,
              ...(input.acceptance.recovery ? {
                recovery: {
                  action: input.acceptance.recovery.action,
                  targetStatus: input.acceptance.recovery.targetStatus,
                  signature: input.acceptance.recovery.signature,
                  changedDimensions: input.acceptance.recovery.changedDimensions,
                },
              } : {}),
            }
          : {
              reasonCode: input.acceptance.reasonCode,
              issuePaths: input.acceptance.issuePaths,
            }),
      },
    })
    return {
      recorded: event !== null,
      ...(event === null ? { reasonCode: "ledger_write_failed" as const } : {}),
    }
  } catch {
    return { recorded: false, reasonCode: "ledger_write_failed" }
  }
}
