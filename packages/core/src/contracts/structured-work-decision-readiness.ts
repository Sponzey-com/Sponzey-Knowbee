import type { ContractValidationIssue } from "./index.js"
import type { LlmDiagnosisGateResult } from "./llm-diagnosis-gate.js"
import type {
  StructuredWorkClassification,
  StructuredWorkPlanDecision,
} from "./structured-work-lifecycle.js"
import {
  validateWorkRecordActionGate,
  type RecommendedAction,
  type WorkRecord,
  type WorkRecordActionGatePhase,
} from "./work-record.js"

export interface StructuredWorkDecisionReadinessInput {
  workRecord?: unknown
  phase: WorkRecordActionGatePhase
  plan: StructuredWorkPlanDecision
  diagnosisGate: LlmDiagnosisGateResult
  selectedAction: RecommendedAction
  rawStateRefs: string[]
}

export type StructuredWorkDecisionReadinessIssueCode =
  | "structured_work_record_required"
  | "work_record_schema_invalid"
  | "work_plan_scope_mismatch"
  | "complex_step_count_invalid"
  | "step_contract_invalid"
  | "step_plan_mismatch"
  | "diagnosis_not_schema_valid"
  | "diagnosis_target_mismatch"
  | "diagnosis_receipt_required"
  | "diagnosis_record_mismatch"
  | "selected_action_mismatch"
  | "diagnosis_action_mismatch"

export interface StructuredWorkDecisionReadinessIssue {
  code: StructuredWorkDecisionReadinessIssueCode
  path?: string
  validationIssues?: ContractValidationIssue[]
}

export type StructuredWorkDecisionReadiness =
  | {
      status: "ready"
      workId: string
      phase: WorkRecordActionGatePhase
      classification: StructuredWorkClassification
      stepIds: string[]
      diagnosisReceiptId: string
      selectedAction: RecommendedAction
    }
  | {
      status: "rejected"
      issues: StructuredWorkDecisionReadinessIssue[]
    }

function issue(
  code: StructuredWorkDecisionReadinessIssueCode,
  path?: string,
  validationIssues?: ContractValidationIssue[],
): StructuredWorkDecisionReadinessIssue {
  return {
    code,
    ...(path ? { path } : {}),
    ...(validationIssues ? {
      validationIssues: validationIssues.map((item) => ({
        path: item.path,
        code: item.code,
        message: item.message,
      })),
    } : {}),
  }
}

function sameDiagnosis(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validStepContract(step: StructuredWorkPlanDecision["steps"][number]): boolean {
  return Boolean(
    step.step_id.trim() &&
    step.owner_agent_name.trim() &&
    step.input_refs.length > 0 &&
    step.input_refs.every((reference) => reference.trim()) &&
    step.expected_output.trim() &&
    step.completion_criteria.trim(),
  )
}

export function decideStructuredWorkDecisionReadiness(
  input: StructuredWorkDecisionReadinessInput,
): StructuredWorkDecisionReadiness {
  if (input.workRecord === undefined || input.workRecord === null) {
    return { status: "rejected", issues: [issue("structured_work_record_required", "$.workRecord")] }
  }

  const validation = validateWorkRecordActionGate(input.workRecord, input.phase)
  if (!validation.ok) {
    return {
      status: "rejected",
      issues: [issue("work_record_schema_invalid", "$.workRecord", validation.issues)],
    }
  }
  const record: WorkRecord = validation.value
  const issues: StructuredWorkDecisionReadinessIssue[] = []

  if (input.plan.workId !== record.work_id || input.plan.ownerAgentName !== record.owner_agent_name) {
    issues.push(issue("work_plan_scope_mismatch", "$.plan"))
  }
  if (input.plan.classification === "complex" && input.plan.steps.length < 2) {
    issues.push(issue("complex_step_count_invalid", "$.plan.steps"))
  }
  input.plan.steps.forEach((step, index) => {
    if (!validStepContract(step)) issues.push(issue("step_contract_invalid", `$.plan.steps[${index}]`))
  })
  const recordSteps = new Map(record.step_plan.map((step) => [step.step_id, step]))
  if (
    recordSteps.size !== input.plan.steps.length ||
    input.plan.steps.some((step) => {
      const canonical = recordSteps.get(step.step_id)
      return !canonical ||
        canonical.owner_agent_name !== step.owner_agent_name ||
        canonical.expected_output !== step.expected_output ||
        canonical.completion_criteria !== step.completion_criteria
    })
  ) {
    issues.push(issue("step_plan_mismatch", "$.plan.steps"))
  }

  const expectedTarget = input.phase === "request" ? "request_diagnosis" : "result_diagnosis"
  if (input.diagnosisGate.status !== "valid") {
    issues.push(issue("diagnosis_not_schema_valid", "$.diagnosisGate"))
  } else {
    if (input.diagnosisGate.target !== expectedTarget) {
      issues.push(issue("diagnosis_target_mismatch", "$.diagnosisGate.target"))
    }
    if (!input.diagnosisGate.receipt) {
      issues.push(issue("diagnosis_receipt_required", "$.diagnosisGate.receipt"))
    }
    const recordDiagnosis = input.phase === "request"
      ? record.request_diagnosis
      : record.result_diagnosis
    if (!sameDiagnosis(input.diagnosisGate.diagnosis, recordDiagnosis)) {
      issues.push(issue("diagnosis_record_mismatch", "$.diagnosisGate.diagnosis"))
    }
    if (input.diagnosisGate.diagnosis.recommended_action !== input.selectedAction) {
      issues.push(issue("diagnosis_action_mismatch", "$.selectedAction"))
    }
  }
  if (record.action_decision.selected_action !== input.selectedAction) {
    issues.push(issue("selected_action_mismatch", "$.selectedAction"))
  }

  if (issues.length > 0 || input.diagnosisGate.status !== "valid" || !input.diagnosisGate.receipt) {
    return { status: "rejected", issues }
  }
  return {
    status: "ready",
    workId: record.work_id,
    phase: input.phase,
    classification: input.plan.classification,
    stepIds: input.plan.steps.map((step) => step.step_id),
    diagnosisReceiptId: input.diagnosisGate.receipt.receiptId,
    selectedAction: input.selectedAction,
  }
}
