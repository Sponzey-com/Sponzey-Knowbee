import type { ContractValidationIssue } from "./index.js"
import {
  validateWorkRecord,
  type RecommendedAction,
  type ResultSufficiency,
  type WorkRecordStatus,
  type WorkStepPlanItem,
  type WorkStepResult,
} from "./work-record.js"

export interface ValidatedWorkRecordStateDecision {
  workStatus: WorkRecordStatus
  requestAction: RecommendedAction
  stepStatuses: Array<{
    stepId: string
    status: WorkStepPlanItem["status"]
  }>
  resultStatuses: Array<{
    stepId: string
    status: WorkStepResult["status"]
  }>
  resultSufficiency: ResultSufficiency
  resultAction: RecommendedAction
  selectedAction: RecommendedAction
}

export type WorkRecordStateDecisionResult =
  | {
      status: "decided"
      decision: ValidatedWorkRecordStateDecision
    }
  | {
      status: "rejected"
      reasonCode: "invalid_structured_record"
      validationIssues: ContractValidationIssue[]
    }

/**
 * Produces state truth only after the complete WorkRecord schema passes.
 * Descriptive text, output bodies, errors, logs, and evidence content are not
 * projected and therefore cannot influence the resulting state decision.
 */
export function decideValidatedWorkRecordState(value: unknown): WorkRecordStateDecisionResult {
  const validation = validateWorkRecord(value)
  if (!validation.ok) {
    return {
      status: "rejected",
      reasonCode: "invalid_structured_record",
      validationIssues: validation.issues.map((issue) => ({ ...issue })),
    }
  }

  const record = validation.value
  return {
    status: "decided",
    decision: {
      workStatus: record.status,
      requestAction: record.request_diagnosis.recommended_action,
      stepStatuses: record.step_plan.map((step) => ({
        stepId: step.step_id,
        status: step.status,
      })),
      resultStatuses: record.step_results.map((result) => ({
        stepId: result.step_id,
        status: result.status,
      })),
      resultSufficiency: record.result_diagnosis.sufficiency,
      resultAction: record.result_diagnosis.recommended_action,
      selectedAction: record.action_decision.selected_action,
    },
  }
}
