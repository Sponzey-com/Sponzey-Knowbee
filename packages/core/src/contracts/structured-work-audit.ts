import type { ContractValidationIssue } from "./index.js"
import {
  buildRuntimeWorkHandoffPackage,
  type RuntimeWorkHandoffProjectionInput,
} from "./work-handoff-projection.js"
import {
  buildRuntimeChildWorkResult,
  type RuntimeChildWorkResultProjectionInput,
} from "./work-result-projection.js"
import {
  type ActionDecision,
  type ChildWorkResult,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type WorkRecord,
  type WorkRecordStatus,
  type WorkRecordTransitionResult,
  type WorkHandoffPackage,
  canTransitionWorkRecordStatus,
  validateLlmRequestDiagnosisRecord,
  validateLlmResultDiagnosisRecord,
  validateWorkRecord,
} from "./work-record.js"

export type StructuredWorkAuditKind = "handoff_projection" | "child_result_projection" | "status_transition"
export type StructuredWorkAuditStatus = "valid" | "invalid" | "skipped"
export type StructuredWorkTransitionReasonCode = NonNullable<WorkRecordTransitionResult["reasonCode"]>
export type StructuredWorkAuditReasonCode =
  | "missing_runtime_diagnosis"
  | "invalid_runtime_diagnosis"
  | "projection_invalid"
  | StructuredWorkTransitionReasonCode

export interface StructuredWorkAuditProductLog {
  enabled: false
  summary: string
}

export interface StructuredWorkAuditFieldDebugLog {
  level: "debug"
  summary: string
  reasonCode?: StructuredWorkAuditReasonCode
  issueCount: number
  issuePaths: string[]
}

export interface StructuredWorkAuditDevelopmentLog {
  level: "dev"
  validationIssues: ContractValidationIssue[]
  transition?: StructuredWorkTransitionDevelopmentLog
}

export interface StructuredWorkTransitionDevelopmentLog {
  fromStatus: WorkRecordStatus
  toStatus: WorkRecordStatus
  reasonCode: StructuredWorkTransitionReasonCode
  message: string
}

export interface StructuredWorkAuditResult<TValue> {
  auditKind: StructuredWorkAuditKind
  status: StructuredWorkAuditStatus
  blocking: false
  reasonCode?: StructuredWorkAuditReasonCode
  value?: TValue
  productLog: StructuredWorkAuditProductLog
  fieldDebugLog: StructuredWorkAuditFieldDebugLog
  developmentLog: StructuredWorkAuditDevelopmentLog
}

export interface AuditedWorkRecordStatusTransitionApplicationResult {
  ok: boolean
  changed: boolean
  record: WorkRecord
  transition: WorkRecordTransitionResult
  audit: StructuredWorkAuditResult<WorkRecordTransitionResult>
}

export type RuntimeWorkHandoffAuditInput = Omit<
  RuntimeWorkHandoffProjectionInput,
  "requestDiagnosis"
> & {
  requestDiagnosis?: LlmRequestDiagnosisRecord
}

export type RuntimeChildWorkResultAuditInput = Omit<
  RuntimeChildWorkResultProjectionInput,
  "resultDiagnosis" | "actionDecision"
> & {
  resultDiagnosis?: LlmResultDiagnosisRecord
  actionDecision?: ActionDecision
}

function issuePaths(issues: ContractValidationIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.path))]
}

function auditResult<TValue>(input: {
  auditKind: StructuredWorkAuditKind
  status: StructuredWorkAuditStatus
  summary: string
  reasonCode?: StructuredWorkAuditReasonCode
  issues?: ContractValidationIssue[]
  value?: TValue
  transition?: StructuredWorkTransitionDevelopmentLog
}): StructuredWorkAuditResult<TValue> {
  const issues = input.issues ?? []
  return {
    auditKind: input.auditKind,
    status: input.status,
    blocking: false,
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.value !== undefined ? { value: input.value } : {}),
    productLog: {
      enabled: false,
      summary: "Structured work audit is diagnostic-only and is not user-facing.",
    },
    fieldDebugLog: {
      level: "debug",
      summary: input.summary,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      issueCount: issues.length,
      issuePaths: issuePaths(issues),
    },
    developmentLog: {
      level: "dev",
      validationIssues: issues,
      ...(input.transition ? { transition: input.transition } : {}),
    },
  }
}

function transitionIssue(message: string): ContractValidationIssue {
  return {
    path: "$.status",
    code: "contract_validation_failed",
    message,
  }
}

export function auditWorkRecordStatusTransition(
  record: WorkRecord,
  nextStatus: WorkRecordStatus,
): StructuredWorkAuditResult<WorkRecordTransitionResult> {
  const transition = canTransitionWorkRecordStatus(record, nextStatus)
  const summary = `Work record status transition ${record.status} -> ${nextStatus}`
  if (transition.ok) {
    return auditResult({
      auditKind: "status_transition",
      status: "valid",
      summary: `${summary} is valid.`,
      value: transition,
    })
  }

  const reasonCode = transition.reasonCode ?? "transition_not_allowed"
  const message = transition.message ?? `${summary} is invalid.`
  return auditResult({
    auditKind: "status_transition",
    status: "invalid",
    reasonCode,
    summary: `${summary} is invalid: ${message}`,
    issues: [transitionIssue(message)],
    transition: {
      fromStatus: record.status,
      toStatus: nextStatus,
      reasonCode,
      message,
    },
  })
}

export function applyAuditedWorkRecordStatusTransition(
  record: WorkRecord,
  nextStatus: WorkRecordStatus,
): AuditedWorkRecordStatusTransitionApplicationResult {
  const currentValidation = validateWorkRecord(record)
  if (!currentValidation.ok) {
    const rejected: WorkRecordTransitionResult = {
      ok: false,
      reasonCode: "invalid_structured_record",
      message: `Current work record is invalid at ${currentValidation.issues.map((issue) => issue.path).join(", ")}.`,
    }
    return {
      ok: false,
      changed: false,
      record,
      transition: rejected,
      audit: auditResult({
        auditKind: "status_transition",
        status: "invalid",
        reasonCode: "invalid_structured_record",
        summary: "Current work record failed canonical schema validation before status update.",
        issues: currentValidation.issues,
        transition: {
          fromStatus: record.status,
          toStatus: nextStatus,
          reasonCode: "invalid_structured_record",
          message: rejected.message ?? "Current work record is invalid.",
        },
      }),
    }
  }
  const transition = canTransitionWorkRecordStatus(record, nextStatus)
  const audit = auditWorkRecordStatusTransition(record, nextStatus)
  if (!transition.ok) {
    return {
      ok: false,
      changed: false,
      record,
      transition,
      audit,
    }
  }

  const candidate: WorkRecord = {
    ...record,
    status: nextStatus,
  }
  const candidateValidation = validateWorkRecord(candidate)
  if (!candidateValidation.ok) {
    const rejected: WorkRecordTransitionResult = {
      ok: false,
      reasonCode: "invalid_structured_record",
      message: `Updated work record is invalid at ${candidateValidation.issues.map((issue) => issue.path).join(", ")}.`,
    }
    return {
      ok: false,
      changed: false,
      record,
      transition: rejected,
      audit: auditResult({
        auditKind: "status_transition",
        status: "invalid",
        reasonCode: "invalid_structured_record",
        summary: "Updated work record failed canonical schema validation.",
        issues: candidateValidation.issues,
        transition: {
          fromStatus: record.status,
          toStatus: nextStatus,
          reasonCode: "invalid_structured_record",
          message: rejected.message ?? "Updated work record is invalid.",
        },
      }),
    }
  }

  return {
    ok: true,
    changed: record.status !== nextStatus,
    record: candidateValidation.value,
    transition,
    audit,
  }
}

export function auditRuntimeWorkHandoffProjection(
  input: RuntimeWorkHandoffAuditInput,
): StructuredWorkAuditResult<WorkHandoffPackage> {
  if (!input.requestDiagnosis) {
    return auditResult({
      auditKind: "handoff_projection",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
      summary: "Structured handoff audit skipped because request diagnosis is not available.",
    })
  }

  const diagnosis = validateLlmRequestDiagnosisRecord(input.requestDiagnosis)
  if (!diagnosis.ok) {
    return auditResult({
      auditKind: "handoff_projection",
      status: "invalid",
      reasonCode: "invalid_runtime_diagnosis",
      summary: "Structured handoff audit found invalid request diagnosis.",
      issues: diagnosis.issues,
    })
  }

  const projection = buildRuntimeWorkHandoffPackage({
    ...input,
    requestDiagnosis: diagnosis.value,
  })
  if (!projection.ok) {
    return auditResult({
      auditKind: "handoff_projection",
      status: "invalid",
      reasonCode: "projection_invalid",
      summary: "Structured handoff audit found invalid projection output.",
      issues: projection.issues,
    })
  }

  return auditResult({
    auditKind: "handoff_projection",
    status: "valid",
    summary: "Structured handoff audit projection is valid.",
    value: projection.value,
  })
}

export function auditRuntimeChildWorkResultProjection(
  input: RuntimeChildWorkResultAuditInput,
): StructuredWorkAuditResult<ChildWorkResult> {
  if (!input.resultDiagnosis || !input.actionDecision) {
    return auditResult({
      auditKind: "child_result_projection",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
      summary: "Structured child result audit skipped because result diagnosis or action decision is not available.",
    })
  }

  const diagnosis = validateLlmResultDiagnosisRecord(input.resultDiagnosis)
  if (!diagnosis.ok) {
    return auditResult({
      auditKind: "child_result_projection",
      status: "invalid",
      reasonCode: "invalid_runtime_diagnosis",
      summary: "Structured child result audit found invalid result diagnosis.",
      issues: diagnosis.issues,
    })
  }

  const projection = buildRuntimeChildWorkResult({
    ...input,
    resultDiagnosis: diagnosis.value,
    actionDecision: input.actionDecision,
  })
  if (!projection.ok) {
    return auditResult({
      auditKind: "child_result_projection",
      status: "invalid",
      reasonCode: "projection_invalid",
      summary: "Structured child result audit found invalid projection output.",
      issues: projection.issues,
    })
  }

  return auditResult({
    auditKind: "child_result_projection",
    status: "valid",
    summary: "Structured child result audit projection is valid.",
    value: projection.value,
  })
}
