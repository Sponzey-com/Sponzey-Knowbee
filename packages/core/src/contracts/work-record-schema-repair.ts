import type { ContractValidationIssue } from "./index.js"
import {
  validateWorkRecord,
  type WorkRecord,
  type WorkStepResult,
} from "./work-record.js"

export interface WorkRecordSchemaRepairProviderInput {
  invalidCandidate: unknown
  validationIssues: ContractValidationIssue[]
  workId: string
  ownerAgentName: string
  failedStepId: string
}

export interface WorkRecordSchemaRepairProvider {
  repairWorkRecord(input: WorkRecordSchemaRepairProviderInput): Promise<unknown> | unknown
}

export interface ResolveWorkRecordWithOneShotRepairInput {
  provider: WorkRecordSchemaRepairProvider
  baseline: WorkRecord
  candidate: unknown
  failedStepId: string
}

export type WorkRecordOneShotRepairResult =
  | {
      status: "valid"
      repairAttempted: boolean
      record: WorkRecord
    }
  | {
      status: "blocked"
      repairAttempted: true
      reasonCode: "invalid_structured_record"
      record: WorkRecord
      validationIssues: ContractValidationIssue[]
    }

function issue(path: string, message: string): ContractValidationIssue {
  return { path, code: "contract_validation_failed", message }
}

function validateCandidateIdentity(candidate: WorkRecord, baseline: WorkRecord): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = []
  if (candidate.work_id !== baseline.work_id) issues.push(issue("$.work_id", "Repaired work_id must match the baseline."))
  if (candidate.parent_work_id !== baseline.parent_work_id) issues.push(issue("$.parent_work_id", "Repaired parent_work_id must match the baseline."))
  if (candidate.owner_agent_name !== baseline.owner_agent_name) issues.push(issue("$.owner_agent_name", "Repaired owner_agent_name must match the baseline."))
  if (candidate.source !== baseline.source) issues.push(issue("$.source", "Repaired source must match the baseline."))
  return issues
}

function validateCandidate(value: unknown, baseline: WorkRecord): {
  ok: true
  value: WorkRecord
  issues: []
} | {
  ok: false
  issues: ContractValidationIssue[]
} {
  const validation = validateWorkRecord(value)
  if (!validation.ok) return validation
  const identityIssues = validateCandidateIdentity(validation.value, baseline)
  return identityIssues.length === 0
    ? { ok: true, value: validation.value, issues: [] }
    : { ok: false, issues: identityIssues }
}

function blockedRecord(
  baseline: WorkRecord,
  failedStepId: string,
  validationIssues: ContractValidationIssue[],
): WorkRecord {
  const failedStep = baseline.step_plan.find((step) => step.step_id === failedStepId)
  if (!failedStep) throw new Error("Failed step ID must exist in the validated baseline WorkRecord.")
  const stepPlan = baseline.step_plan.map((step) => step.step_id === failedStepId
    ? { ...step, status: "blocked" as const }
    : structuredClone(step))
  const blockedResult: WorkStepResult = {
    step_id: failedStepId,
    status: "blocked",
    evidence_refs: [],
    error: "invalid_structured_record",
  }
  const stepResults = [
    ...baseline.step_results
      .filter((result) => result.step_id !== failedStepId)
      .map((result) => structuredClone(result)),
    blockedResult,
  ]
  const candidate: WorkRecord = {
    schemaVersion: baseline.schemaVersion,
    work_id: baseline.work_id,
    ...(baseline.parent_work_id ? { parent_work_id: baseline.parent_work_id } : {}),
    owner_agent_name: baseline.owner_agent_name,
    source: baseline.source,
    status: "blocked",
    user_request_summary: baseline.user_request_summary,
    request_diagnosis: structuredClone(baseline.request_diagnosis),
    step_plan: stepPlan,
    step_results: stepResults,
    result_diagnosis: {
      diagnosis_summary: "Work record schema repair did not produce a valid record.",
      sufficiency: "insufficient",
      missing_information: [],
      conflicts: [],
      risk: "invalid_structured_record",
      risks: [],
      confidence: "high",
      recommended_action: "stop_blocked",
      reason: "The repaired work record failed canonical validation.",
    },
    failure_diagnosis: {
      failed_step_id: failedStepId,
      failure_reason: "invalid_structured_record",
      failed_input_refs: [...new Set(validationIssues.map((item) => item.path))],
      failed_strategy: "schema_repair",
      recoverable: false,
    },
    retry_count: baseline.retry_count,
    retry_limit: baseline.retry_limit,
    stop_condition: "invalid_structured_record_after_schema_repair",
    action_decision: {
      selected_action: "stop_blocked",
      reason: "Block execution because schema repair remained invalid.",
    },
  }
  const validation = validateWorkRecord(candidate)
  if (!validation.ok) {
    throw new Error(`Blocked WorkRecord projection failed validation at ${validation.issues.map((item) => item.path).join(", ")}.`)
  }
  return validation.value
}

export async function resolveWorkRecordWithOneShotRepair(
  input: ResolveWorkRecordWithOneShotRepairInput,
): Promise<WorkRecordOneShotRepairResult> {
  const baselineValidation = validateWorkRecord(input.baseline)
  if (!baselineValidation.ok) throw new Error("Baseline WorkRecord must pass canonical validation before repair.")
  const baseline = baselineValidation.value
  const failedStepId = input.failedStepId.trim()
  if (!failedStepId || !baseline.step_plan.some((step) => step.step_id === failedStepId)) {
    throw new Error("Failed step ID must exist in the validated baseline WorkRecord.")
  }

  const initial = validateCandidate(input.candidate, baseline)
  if (initial.ok) return { status: "valid", repairAttempted: false, record: initial.value }

  let repaired: unknown
  let providerFailed = false
  try {
    repaired = await input.provider.repairWorkRecord({
      invalidCandidate: input.candidate,
      validationIssues: initial.issues.map((item) => ({ ...item })),
      workId: baseline.work_id,
      ownerAgentName: baseline.owner_agent_name,
      failedStepId,
    })
  } catch {
    providerFailed = true
  }
  const repairedValidation = providerFailed
    ? { ok: false as const, issues: [issue("$", "WorkRecord schema repair provider failed.")] }
    : validateCandidate(repaired, baseline)
  if (repairedValidation.ok) {
    return { status: "valid", repairAttempted: true, record: repairedValidation.value }
  }
  return {
    status: "blocked",
    repairAttempted: true,
    reasonCode: "invalid_structured_record",
    record: blockedRecord(baseline, failedStepId, repairedValidation.issues),
    validationIssues: repairedValidation.issues.map((item) => ({ ...item })),
  }
}
