import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js"
import type { LlmInvocationReceipt } from "../observability/llm-invocation-receipt.js"

export interface LiveSmokeDecisionReceiptRefs {
  directResponseReceiptId?: string
  directResponseReceiptValid?: boolean
  requestDiagnosisReceiptId?: string
  solutionPlanReceiptId?: string
  resultReviewReceiptId?: string
  finalResponseReceiptId?: string
  decisionReceiptOrderValid: boolean
  capabilityAdmissionReceiptId?: string
}

export interface CapabilityAdmissionEvidenceReader {
  readForRun(runId: string): string | undefined
}

export type LiveSmokeDecisionReceiptReader = (
  runId: string,
  requestGroupId: string,
) => LiveSmokeDecisionReceiptRefs

const OPERATIONS = {
  requestDiagnosisReceiptId: {
    stage: "intake",
    codes: new Set([
      "request_diagnosis",
      "task_intake",
      "task_intake_schema_repair",
    ]),
  },
  solutionPlanReceiptId: {
    stage: "planning",
    codes: new Set(["solution_plan", "solution_plan_schema_repair"]),
  },
  resultReviewReceiptId: {
    stage: "review",
    codes: new Set([
      "result_diagnosis",
      "schema_repair",
      "completion_review",
      "completion_review_repair",
    ]),
  },
  finalResponseReceiptId: {
    stage: "final_response",
    codes: new Set(["final_response", "final_response_repair"]),
  },
} as const

const DIRECT_RESPONSE_OPERATIONS = new Set([
  "task_intake",
  "task_intake_schema_repair",
])

type DecisionReceiptKey = keyof typeof OPERATIONS
type IndexedReceipt = {
  receipt: LlmInvocationReceipt
  index: number
}

function matchesOperation(
  receipt: LlmInvocationReceipt,
  key: DecisionReceiptKey,
): boolean {
  const operation = OPERATIONS[key]
  return receipt.context.stage === operation.stage
    && operation.codes.has(receipt.context.operationCode)
}

function findLatestReceipt(
  completed: readonly LlmInvocationReceipt[],
  key: DecisionReceiptKey,
  startIndex = 0,
  endIndex = completed.length,
  latestAt = Number.POSITIVE_INFINITY,
): IndexedReceipt | undefined {
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    const receipt = completed[index]
    if (receipt && receipt.at <= latestAt && matchesOperation(receipt, key)) {
      return { receipt, index }
    }
  }
  return undefined
}

function findLatestCompleteCycle(
  completed: readonly LlmInvocationReceipt[],
): readonly [
  LlmInvocationReceipt,
  LlmInvocationReceipt,
  LlmInvocationReceipt,
  LlmInvocationReceipt,
] | undefined {
  const diagnosisIndexes = completed.flatMap((receipt, index) =>
    matchesOperation(receipt, "requestDiagnosisReceiptId") ? [index] : [],
  )
  for (let cycle = diagnosisIndexes.length - 1; cycle >= 0; cycle -= 1) {
    const diagnosisIndex = diagnosisIndexes[cycle]!
    const diagnosis = completed[diagnosisIndex]!
    const cycleEnd = diagnosisIndexes[cycle + 1] ?? completed.length
    const finalResponse = findLatestReceipt(
      completed,
      "finalResponseReceiptId",
      diagnosisIndex + 1,
      cycleEnd,
    )
    if (!finalResponse || finalResponse.receipt.at < diagnosis.at) continue
    const resultReview = findLatestReceipt(
      completed,
      "resultReviewReceiptId",
      diagnosisIndex + 1,
      finalResponse.index,
      finalResponse.receipt.at,
    )
    if (!resultReview || resultReview.receipt.at < diagnosis.at) continue
    if (DIRECT_RESPONSE_OPERATIONS.has(diagnosis.context.operationCode)) {
      return [
        diagnosis,
        diagnosis,
        resultReview.receipt,
        finalResponse.receipt,
      ]
    }
    const solutionPlan = findLatestReceipt(
      completed,
      "solutionPlanReceiptId",
      diagnosisIndex + 1,
      resultReview.index,
      resultReview.receipt.at,
    )
    if (!solutionPlan || solutionPlan.receipt.at < diagnosis.at) continue
    return [
      diagnosis,
      solutionPlan.receipt,
      resultReview.receipt,
      finalResponse.receipt,
    ]
  }
  return undefined
}

export function createLiveSmokeDecisionReceiptReader(
  repository: Pick<LlmInvocationReceiptRepository, "list">,
  capabilityAdmissionReader?: CapabilityAdmissionEvidenceReader,
): LiveSmokeDecisionReceiptReader {
  return (runId, requestGroupId) => {
    const joinedReceipts = new Map<string, LlmInvocationReceipt>()
    for (const receipt of [
      ...repository.list({ requestGroupId, limit: 500 }),
      ...repository.list({ runId, limit: 500 }),
    ]) {
      joinedReceipts.set(`${receipt.invocationId}:${receipt.phase}`, receipt)
    }
    const completed = [...joinedReceipts.values()]
      .filter(
        (receipt) =>
          receipt.phase === "completed"
          && (
            receipt.context.requestGroupId === requestGroupId
            || receipt.context.runId === runId
          ),
      )
      .filter(
        (receipt) =>
          receipt.context.runId === runId
          || (
            receipt.context.runId === undefined
            && requestGroupId === runId
            && receipt.context.stage === "intake"
            && DIRECT_RESPONSE_OPERATIONS.has(receipt.context.operationCode)
          ),
      )
      .sort((left, right) => left.at - right.at)
    const result: LiveSmokeDecisionReceiptRefs = {
      decisionReceiptOrderValid: false,
    }
    const directResponseReceipt = [...completed].reverse().find(
      (receipt) =>
        receipt.context.stage === "intake"
        && DIRECT_RESPONSE_OPERATIONS.has(receipt.context.operationCode),
    )
    if (directResponseReceipt) {
      result.directResponseReceiptId =
        `llm-invocation:${directResponseReceipt.invocationId}`
      result.directResponseReceiptValid = true
    }
    const keys = Object.keys(OPERATIONS) as DecisionReceiptKey[]
    const completeCycle = findLatestCompleteCycle(completed)
    for (const [index, key] of keys.entries()) {
      const receipt = completeCycle?.[index] ?? findLatestReceipt(completed, key)?.receipt
      if (
        !completeCycle &&
        key === "requestDiagnosisReceiptId" &&
        receipt &&
        DIRECT_RESPONSE_OPERATIONS.has(receipt.context.operationCode)
      ) {
        continue
      }
      if (receipt) {
        result[key] = `llm-invocation:${receipt.invocationId}`
      }
    }
    result.decisionReceiptOrderValid = completeCycle !== undefined
    const capabilityAdmissionReceiptId =
      capabilityAdmissionReader?.readForRun(runId)?.trim()
    if (capabilityAdmissionReceiptId) {
      result.capabilityAdmissionReceiptId = capabilityAdmissionReceiptId
    }
    return result
  }
}
