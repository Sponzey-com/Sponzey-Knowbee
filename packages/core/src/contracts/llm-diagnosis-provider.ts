import {
  gateLlmDiagnosisOutput,
  type LlmDiagnosisGateResult,
} from "./llm-diagnosis-gate.js"
import {
  runDiagnosisSchemaRepairProvider,
  type LlmDiagnosisSchemaRepairProvider,
} from "./llm-diagnosis-schema-repair-provider.js"
import type { DiagnosisSubjectKind } from "./diagnosis-action-routing.js"

export type ResultDiagnosisSubjectKind = Exclude<DiagnosisSubjectKind, "user_request">

export interface LlmRequestDiagnosisProviderInput {
  ownerAgentName: string
  userRequestSummary: string
  context: string[]
  constraints: string[]
  workId?: string
  stepId: string
}

export interface LlmResultDiagnosisProviderInput {
  ownerAgentName: string
  resultSummary: string
  expectedOutput: string
  evidence: string[]
  risks: string[]
  workId?: string
  stepId: string
  evidenceSourceKind?: "tool" | "child" | "memory"
}

export interface LlmDiagnosisProvider {
  diagnoseRequest(input: LlmRequestDiagnosisProviderInput): Promise<unknown> | unknown
  diagnoseResult(input: LlmResultDiagnosisProviderInput): Promise<unknown> | unknown
}

export interface RunRequestDiagnosisProviderInput extends LlmRequestDiagnosisProviderInput {
  provider: LlmDiagnosisProvider
  repairAttempted: boolean
}

export interface RunResultDiagnosisProviderInput extends LlmResultDiagnosisProviderInput {
  provider: LlmDiagnosisProvider
  repairAttempted: boolean
  diagnosisSubjectKind?: ResultDiagnosisSubjectKind
}

export interface RunRequestDiagnosisProviderWithRepairInput extends LlmRequestDiagnosisProviderInput {
  provider: LlmDiagnosisProvider
  repairProvider: LlmDiagnosisSchemaRepairProvider
}

export interface RunResultDiagnosisProviderWithRepairInput extends LlmResultDiagnosisProviderInput {
  provider: LlmDiagnosisProvider
  repairProvider: LlmDiagnosisSchemaRepairProvider
  diagnosisSubjectKind?: ResultDiagnosisSubjectKind
}

export async function runRequestDiagnosisProvider(
  input: RunRequestDiagnosisProviderInput,
): Promise<LlmDiagnosisGateResult> {
  const subjectPayload: LlmRequestDiagnosisProviderInput = {
    ownerAgentName: input.ownerAgentName,
    userRequestSummary: input.userRequestSummary,
    context: input.context,
    constraints: input.constraints,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
  }
  const rawOutput = await input.provider.diagnoseRequest(subjectPayload)

  return gateLlmDiagnosisOutput({
    target: "request_diagnosis",
    rawOutput,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failedStepId: input.stepId,
    failedInputRefs: ["llm-output:request_diagnosis"],
    failedStrategy: input.repairAttempted ? "schema_repair" : "initial_llm_diagnosis",
    repairAttempted: input.repairAttempted,
    receiptBinding: {
      receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:request`,
      subjectKind: "user_request",
      subjectPayload,
    },
  })
}

export async function runRequestDiagnosisProviderWithRepair(
  input: RunRequestDiagnosisProviderWithRepairInput,
): Promise<LlmDiagnosisGateResult> {
  const subjectPayload: LlmRequestDiagnosisProviderInput = {
    ownerAgentName: input.ownerAgentName,
    userRequestSummary: input.userRequestSummary,
    context: input.context,
    constraints: input.constraints,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
  }
  const rawOutput = await input.provider.diagnoseRequest(subjectPayload)
  const receiptBinding = {
    receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:request`,
    subjectKind: "user_request" as const,
    subjectPayload,
  }

  const initialResult = gateLlmDiagnosisOutput({
    target: "request_diagnosis",
    rawOutput,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failedStepId: input.stepId,
    failedInputRefs: ["llm-output:request_diagnosis"],
    failedStrategy: "initial_llm_diagnosis",
    repairAttempted: false,
    receiptBinding,
  })

  if (initialResult.status !== "repair_required") return initialResult

  return runDiagnosisSchemaRepairProvider({
    provider: input.repairProvider,
    target: "request_diagnosis",
    invalidRawOutput: rawOutput,
    validationIssues: initialResult.repairDecision.validationIssues,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
    receiptBinding,
  })
}

export async function runResultDiagnosisProvider(
  input: RunResultDiagnosisProviderInput,
): Promise<LlmDiagnosisGateResult> {
  const subjectPayload: LlmResultDiagnosisProviderInput = {
    ownerAgentName: input.ownerAgentName,
    resultSummary: input.resultSummary,
    expectedOutput: input.expectedOutput,
    evidence: input.evidence,
    risks: input.risks,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
    ...(input.evidenceSourceKind ? { evidenceSourceKind: input.evidenceSourceKind } : {}),
  }
  const rawOutput = await input.provider.diagnoseResult(subjectPayload)

  return gateLlmDiagnosisOutput({
    target: "result_diagnosis",
    rawOutput,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failedStepId: input.stepId,
    failedInputRefs: ["llm-output:result_diagnosis"],
    failedStrategy: input.repairAttempted ? "schema_repair" : "initial_llm_result_diagnosis",
    repairAttempted: input.repairAttempted,
    receiptBinding: {
      receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:result`,
      subjectKind: input.diagnosisSubjectKind ?? "validation_result",
      subjectPayload,
    },
  })
}

export async function runResultDiagnosisProviderWithRepair(
  input: RunResultDiagnosisProviderWithRepairInput,
): Promise<LlmDiagnosisGateResult> {
  const subjectPayload: LlmResultDiagnosisProviderInput = {
    ownerAgentName: input.ownerAgentName,
    resultSummary: input.resultSummary,
    expectedOutput: input.expectedOutput,
    evidence: input.evidence,
    risks: input.risks,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
    ...(input.evidenceSourceKind ? { evidenceSourceKind: input.evidenceSourceKind } : {}),
  }
  const rawOutput = await input.provider.diagnoseResult(subjectPayload)
  const receiptBinding = {
    receiptId: `diagnosis:${input.workId ?? "unscoped"}:${input.stepId}:result`,
    subjectKind: input.diagnosisSubjectKind ?? "validation_result",
    subjectPayload,
  }

  const initialResult = gateLlmDiagnosisOutput({
    target: "result_diagnosis",
    rawOutput,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failedStepId: input.stepId,
    failedInputRefs: ["llm-output:result_diagnosis"],
    failedStrategy: "initial_llm_result_diagnosis",
    repairAttempted: false,
    receiptBinding,
  })

  if (initialResult.status !== "repair_required") return initialResult

  return runDiagnosisSchemaRepairProvider({
    provider: input.repairProvider,
    target: "result_diagnosis",
    invalidRawOutput: rawOutput,
    validationIssues: initialResult.repairDecision.validationIssues,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    stepId: input.stepId,
    receiptBinding,
  })
}
