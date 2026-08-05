import type { LlmDiagnosisReceipt } from "./diagnosis-action-routing.js"
import type {
  StructuredWorkLifecycleProjection,
  StructuredWorkPlanDecision,
} from "./structured-work-lifecycle.js"
import type { RecommendedAction } from "./work-record.js"

export interface ScopedLlmDiagnosisReceipt {
  workId: string
  runId: string
  receipt: LlmDiagnosisReceipt
}

export interface LlmDiagnosedActionFlowInput {
  workId: string
  runId: string
  requestDiagnosis?: ScopedLlmDiagnosisReceipt
  resultDiagnosis?: ScopedLlmDiagnosisReceipt
  plan: StructuredWorkPlanDecision
  projection: StructuredWorkLifecycleProjection
  selectedAction: RecommendedAction
  rawInputRefs: string[]
  rawResultRefs: string[]
}

export type LlmDiagnosedActionFlowIssueCode =
  | "work_id_required"
  | "run_id_required"
  | "request_diagnosis_missing"
  | "result_diagnosis_missing"
  | "raw_input_not_authoritative"
  | "raw_result_not_authoritative"
  | "request_diagnosis_scope_mismatch"
  | "result_diagnosis_scope_mismatch"
  | "request_diagnosis_target_invalid"
  | "result_diagnosis_target_invalid"
  | "request_action_mismatch"
  | "diagnosis_action_mismatch"
  | "plan_scope_mismatch"
  | "projection_scope_mismatch"
  | "request_receipt_reference_mismatch"
  | "plan_receipt_reference_mismatch"
  | "result_receipt_reference_mismatch"
  | "trace_work_scope_mismatch"
  | "required_trace_phase_missing"
  | "trace_phase_order_invalid"
  | "selected_action_trace_mismatch"

export interface LlmDiagnosedActionFlowIssue {
  code: LlmDiagnosedActionFlowIssueCode
  path?: string
}

export type LlmDiagnosedActionFlowAcceptance =
  | {
      status: "accepted"
      workId: string
      runId: string
      requestReceiptId: string
      resultReceiptId: string
      selectedAction: RecommendedAction
      traceReasonCodes: string[]
    }
  | {
      status: "rejected"
      workId: string
      runId: string
      issues: LlmDiagnosedActionFlowIssue[]
    }

const REQUIRED_COMPLEX_TRACE_REASONS = [
  "request_diagnosis_received",
  "solution_plan_received",
  "work_classified_",
  "step_plan_validated",
  "step_results_received",
  "result_diagnosis_received",
  "next_action_",
  "lifecycle_",
] as const

const REQUIRED_SIMPLE_TRACE_REASONS = [
  "request_diagnosis_received",
  "solution_plan_received",
  "simple_route_",
  "step_results_received",
  "result_diagnosis_received",
  "simple_output_",
] as const

function normalized(value: string): string {
  return value.trim()
}

function addIssue(
  issues: LlmDiagnosedActionFlowIssue[],
  code: LlmDiagnosedActionFlowIssueCode,
  path?: string,
): void {
  if (!issues.some((issue) => issue.code === code && issue.path === path)) {
    issues.push(path ? { code, path } : { code })
  }
}

function receiptReferenced(
  projection: StructuredWorkLifecycleProjection,
  reasonCode: string,
  receiptId: string,
): boolean {
  return projection.trace.some(
    (event) => event.reasonCode === reasonCode && event.referenceIds.includes(receiptId),
  )
}

function traceReasonIndex(reasonCodes: string[], expected: string): number {
  return expected.endsWith("_")
    ? reasonCodes.findIndex((reason) => reason.startsWith(expected))
    : reasonCodes.indexOf(expected)
}

export function decideLlmDiagnosedActionFlowAcceptance(
  input: LlmDiagnosedActionFlowInput,
): LlmDiagnosedActionFlowAcceptance {
  const workId = normalized(input.workId)
  const runId = normalized(input.runId)
  const issues: LlmDiagnosedActionFlowIssue[] = []
  if (!workId) addIssue(issues, "work_id_required", "$.workId")
  if (!runId) addIssue(issues, "run_id_required", "$.runId")

  const request = input.requestDiagnosis
  if (!request) {
    addIssue(
      issues,
      input.rawInputRefs.length > 0 ? "raw_input_not_authoritative" : "request_diagnosis_missing",
      "$.requestDiagnosis",
    )
  } else {
    if (request.workId !== workId || request.runId !== runId) {
      addIssue(issues, "request_diagnosis_scope_mismatch", "$.requestDiagnosis")
    }
    if (request.receipt.target !== "request_diagnosis") {
      addIssue(issues, "request_diagnosis_target_invalid", "$.requestDiagnosis.receipt.target")
    }
    if (request.receipt.recommendedAction !== input.plan.requestAction) {
      addIssue(issues, "request_action_mismatch", "$.plan.requestAction")
    }
    if (request.receipt.receiptId !== input.plan.requestReceiptId) {
      addIssue(issues, "request_receipt_reference_mismatch", "$.plan.requestReceiptId")
    }
    if (
      !receiptReferenced(input.projection, "request_diagnosis_received", request.receipt.receiptId)
    ) {
      addIssue(issues, "request_receipt_reference_mismatch", "$.projection.trace")
    }
  }

  const result = input.resultDiagnosis
  if (!result) {
    addIssue(
      issues,
      input.rawResultRefs.length > 0 ? "raw_result_not_authoritative" : "result_diagnosis_missing",
      "$.resultDiagnosis",
    )
  } else {
    if (result.workId !== workId || result.runId !== runId) {
      addIssue(issues, "result_diagnosis_scope_mismatch", "$.resultDiagnosis")
    }
    if (result.receipt.target !== "result_diagnosis") {
      addIssue(issues, "result_diagnosis_target_invalid", "$.resultDiagnosis.receipt.target")
    }
    if (result.receipt.recommendedAction !== input.selectedAction) {
      addIssue(issues, "diagnosis_action_mismatch", "$.selectedAction")
    }
    if (result.receipt.receiptId !== input.projection.resultReceiptId) {
      addIssue(issues, "result_receipt_reference_mismatch", "$.projection.resultReceiptId")
    }
    if (
      !receiptReferenced(input.projection, "result_diagnosis_received", result.receipt.receiptId)
    ) {
      addIssue(issues, "result_receipt_reference_mismatch", "$.projection.trace")
    }
  }

  if (input.plan.workId !== workId || input.plan.runId !== runId) {
    addIssue(issues, "plan_scope_mismatch", "$.plan")
  }
  if (
    !receiptReferenced(input.projection, "solution_plan_received", input.plan.solutionPlanReceiptId)
  ) {
    addIssue(issues, "plan_receipt_reference_mismatch", "$.projection.trace")
  }
  if (input.projection.workId !== workId) {
    addIssue(issues, "projection_scope_mismatch", "$.projection.workId")
  }
  if (input.projection.trace.some((event) => event.workId !== workId)) {
    addIssue(issues, "trace_work_scope_mismatch", "$.projection.trace")
  }

  const reasonCodes = input.projection.trace.map((event) => event.reasonCode)
  const requiredReasons =
    input.plan.classification === "simple"
      ? REQUIRED_SIMPLE_TRACE_REASONS
      : REQUIRED_COMPLEX_TRACE_REASONS
  const indexes = requiredReasons.map((reason) => traceReasonIndex(reasonCodes, reason))
  if (indexes.some((index) => index < 0)) {
    addIssue(issues, "required_trace_phase_missing", "$.projection.trace")
  } else if (
    indexes.some((index, position) => position > 0 && index <= (indexes[position - 1] ?? -1))
  ) {
    addIssue(issues, "trace_phase_order_invalid", "$.projection.trace")
  }
  const selectedActionRecorded =
    input.plan.classification === "simple"
      ? reasonCodes.some((reason) => reason.startsWith(`simple_output_${input.selectedAction}_`))
      : reasonCodes.includes(`next_action_${input.selectedAction}`)
  if (!selectedActionRecorded) {
    addIssue(issues, "selected_action_trace_mismatch", "$.projection.trace")
  }

  if (issues.length > 0 || !request || !result) {
    return { status: "rejected", workId, runId, issues }
  }
  return {
    status: "accepted",
    workId,
    runId,
    requestReceiptId: request.receipt.receiptId,
    resultReceiptId: result.receipt.receiptId,
    selectedAction: input.selectedAction,
    traceReasonCodes: reasonCodes,
  }
}
