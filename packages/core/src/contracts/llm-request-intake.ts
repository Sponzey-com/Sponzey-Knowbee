import { createHash } from "node:crypto"

export interface RequestInstructionSnapshot {
  instructionId: string
  sequence: number
  text: string
}

export interface RequestContextCandidate {
  contextRef: string
  source: "conversation" | "memory"
  content: string
}

export interface RequestIntakeContext {
  requestId: string
  originalRequest: string
  priorInstructions: RequestInstructionSnapshot[]
  latestInstruction: RequestInstructionSnapshot
  contextCandidates: RequestContextCandidate[]
}

export interface LlmRequestContextAssessment {
  contextRef: string
  relevant: boolean
  reason: string
}

export interface LlmRequestInstructionLineage {
  instructionId: string
  sequence: number
}

export interface LlmRequestIntakeDecision {
  schemaVersion: 1
  requestId: string
  originalRequest: string
  goal: string
  desiredResult: string
  explicitExecutionMethod: string | null
  completionCriteria: string[]
  forbiddenActions: string[]
  allowedTargets: string[]
  deliveryDestination: string | null
  approvalRequiredSideEffects: string[]
  contextAssessments: LlmRequestContextAssessment[]
  selectedContextRefs: string[]
  instructionLineage: LlmRequestInstructionLineage[]
  latestInstructionId: string
  reason: string
}

export interface LlmRequestIntakeReceipt {
  schemaVersion: 1
  receiptId: string
  requestId: string
  decisionFingerprint: `sha256:${string}`
}

export interface LlmRequestIntakeProvider {
  analyzeRequest(
    context: RequestIntakeContext,
  ): LlmRequestIntakeDecision | Promise<LlmRequestIntakeDecision>
}

export type LlmRequestIntakeRejectionCode =
  | "intake_schema_invalid"
  | "request_context_invalid"
  | "request_scope_mismatch"
  | "original_request_mismatch"
  | "context_selection_invalid"
  | "instruction_lineage_invalid"
  | "latest_instruction_not_authoritative"
  | "intake_receipt_missing"
  | "intake_receipt_mismatch"

export type LlmRequestIntakeAdmission =
  | {
      status: "admitted"
      requestId: string
      originalRequest: string
      goal: string
      desiredResult: string
      explicitExecutionMethod: string | null
      latestInstructionId: string
      selectedContextRefs: string[]
      constraints: {
        completionCriteria: string[]
        forbiddenActions: string[]
        allowedTargets: string[]
        deliveryDestination: string | null
        approvalRequiredSideEffects: string[]
      }
      receiptId: string
    }
  | { status: "rejected"; reasonCodes: LlmRequestIntakeRejectionCode[] }

function normalized(value: string): string {
  return value.trim()
}

function uniqueNonEmpty(values: string[]): boolean {
  const normalizedValues = values.map(normalized)
  return (
    normalizedValues.every(Boolean) && new Set(normalizedValues).size === normalizedValues.length
  )
}

function sameOrderedValues(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => normalized(value) === normalized(right[index] ?? ""))
  )
}

function sameUnorderedValues(left: string[], right: string[]): boolean {
  if (!uniqueNonEmpty(left) || !uniqueNonEmpty(right)) return false
  const sortedLeft = left.map(normalized).sort()
  const sortedRight = right.map(normalized).sort()
  return sameOrderedValues(sortedLeft, sortedRight)
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
    .join(",")}}`
}

function decisionFingerprint(decision: LlmRequestIntakeDecision): `sha256:${string}` {
  const hash = createHash("sha256")
    .update(`knowbee:llm-request-intake:${canonicalize(decision)}`)
    .digest("hex")
  return `sha256:${hash}`
}

function validStringArray(value: unknown, allowEmpty: boolean): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string") &&
    uniqueNonEmpty(value)
  )
}

function structurallyValidDecision(decision: LlmRequestIntakeDecision): boolean {
  return Boolean(
    decision?.schemaVersion === 1 &&
      normalized(decision.requestId) &&
      normalized(decision.originalRequest) &&
      normalized(decision.goal) &&
      normalized(decision.desiredResult) &&
      (decision.explicitExecutionMethod === null ||
        (typeof decision.explicitExecutionMethod === "string" &&
          normalized(decision.explicitExecutionMethod))) &&
      validStringArray(decision.completionCriteria, false) &&
      validStringArray(decision.forbiddenActions, true) &&
      validStringArray(decision.allowedTargets, true) &&
      (decision.deliveryDestination === null ||
        (typeof decision.deliveryDestination === "string" &&
          normalized(decision.deliveryDestination))) &&
      validStringArray(decision.approvalRequiredSideEffects, true) &&
      Array.isArray(decision.contextAssessments) &&
      decision.contextAssessments.every(
        (assessment) =>
          normalized(assessment.contextRef) &&
          typeof assessment.relevant === "boolean" &&
          normalized(assessment.reason),
      ) &&
      validStringArray(decision.selectedContextRefs, true) &&
      Array.isArray(decision.instructionLineage) &&
      decision.instructionLineage.length > 0 &&
      decision.instructionLineage.every(
        (item) =>
          normalized(item.instructionId) &&
          Number.isSafeInteger(item.sequence) &&
          item.sequence >= 0,
      ) &&
      normalized(decision.latestInstructionId) &&
      normalized(decision.reason),
  )
}

function structurallyValidContext(context: RequestIntakeContext): boolean {
  const instructions = [...context.priorInstructions, context.latestInstruction]
  return Boolean(
    normalized(context.requestId) &&
      normalized(context.originalRequest) &&
      normalized(context.latestInstruction.instructionId) &&
      normalized(context.latestInstruction.text) === normalized(context.originalRequest) &&
      instructions.every(
        (item) =>
          normalized(item.instructionId) &&
          normalized(item.text) &&
          Number.isSafeInteger(item.sequence) &&
          item.sequence >= 0,
      ) &&
      uniqueNonEmpty(instructions.map((item) => item.instructionId)) &&
      instructions.every(
        (item, index) => index === 0 || item.sequence > (instructions[index - 1]?.sequence ?? -1),
      ) &&
      context.contextCandidates.every(
        (candidate) =>
          normalized(candidate.contextRef) &&
          normalized(candidate.content) &&
          (candidate.source === "conversation" || candidate.source === "memory"),
      ) &&
      uniqueNonEmpty(context.contextCandidates.map((candidate) => candidate.contextRef)),
  )
}

function validContextSelection(
  context: RequestIntakeContext,
  decision: LlmRequestIntakeDecision,
): boolean {
  const candidateRefs = context.contextCandidates.map((candidate) => candidate.contextRef)
  const assessmentRefs = decision.contextAssessments.map((assessment) => assessment.contextRef)
  if (!sameUnorderedValues(assessmentRefs, candidateRefs)) return false
  const relevantRefs = decision.contextAssessments
    .filter((assessment) => assessment.relevant)
    .map((assessment) => assessment.contextRef)
  return sameUnorderedValues(decision.selectedContextRefs, relevantRefs)
}

function validInstructionLineage(
  context: RequestIntakeContext,
  decision: LlmRequestIntakeDecision,
): boolean {
  const expected = [...context.priorInstructions, context.latestInstruction]
  if (decision.instructionLineage.length !== expected.length) return false
  return decision.instructionLineage.every((item, index) => {
    const expectedItem = expected[index]
    return (
      normalized(item.instructionId) === normalized(expectedItem?.instructionId ?? "") &&
      item.sequence === expectedItem?.sequence
    )
  })
}

export function createLlmRequestIntakeReceipt(input: {
  receiptId: string
  decision: LlmRequestIntakeDecision
}): LlmRequestIntakeReceipt {
  const receiptId = normalized(input.receiptId)
  if (!receiptId) throw new Error("Request intake receipt ID is required.")
  return {
    schemaVersion: 1,
    receiptId,
    requestId: normalized(input.decision.requestId),
    decisionFingerprint: decisionFingerprint(input.decision),
  }
}

export async function runLlmRequestIntakeProvider(input: {
  provider: LlmRequestIntakeProvider
  receiptId: string
  context: RequestIntakeContext
}): Promise<{ decision: LlmRequestIntakeDecision; receipt: LlmRequestIntakeReceipt }> {
  const decision = await input.provider.analyzeRequest(input.context)
  return {
    decision,
    receipt: createLlmRequestIntakeReceipt({ receiptId: input.receiptId, decision }),
  }
}

export function admitLlmRequestIntake(input: {
  context: RequestIntakeContext
  decision: LlmRequestIntakeDecision
  receipt?: LlmRequestIntakeReceipt
}): LlmRequestIntakeAdmission {
  if (!structurallyValidDecision(input.decision)) {
    return { status: "rejected", reasonCodes: ["intake_schema_invalid"] }
  }
  const reasonCodes: LlmRequestIntakeRejectionCode[] = []
  if (!structurallyValidContext(input.context)) reasonCodes.push("request_context_invalid")
  if (normalized(input.decision.requestId) !== normalized(input.context.requestId)) {
    reasonCodes.push("request_scope_mismatch")
  }
  if (normalized(input.decision.originalRequest) !== normalized(input.context.originalRequest)) {
    reasonCodes.push("original_request_mismatch")
  }
  if (!validContextSelection(input.context, input.decision)) {
    reasonCodes.push("context_selection_invalid")
  }
  if (!validInstructionLineage(input.context, input.decision)) {
    reasonCodes.push("instruction_lineage_invalid")
  }
  if (
    normalized(input.decision.latestInstructionId) !==
    normalized(input.context.latestInstruction.instructionId)
  ) {
    reasonCodes.push("latest_instruction_not_authoritative")
  }
  if (!input.receipt || !normalized(input.receipt.receiptId)) {
    reasonCodes.push("intake_receipt_missing")
  } else if (
    input.receipt.schemaVersion !== 1 ||
    normalized(input.receipt.requestId) !== normalized(input.decision.requestId) ||
    input.receipt.decisionFingerprint !== decisionFingerprint(input.decision)
  ) {
    reasonCodes.push("intake_receipt_mismatch")
  }
  if (reasonCodes.length > 0 || !input.receipt) {
    return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] }
  }
  return {
    status: "admitted",
    requestId: normalized(input.decision.requestId),
    originalRequest: input.decision.originalRequest,
    goal: input.decision.goal,
    desiredResult: input.decision.desiredResult,
    explicitExecutionMethod: input.decision.explicitExecutionMethod,
    latestInstructionId: input.decision.latestInstructionId,
    selectedContextRefs: [...input.decision.selectedContextRefs],
    constraints: {
      completionCriteria: [...input.decision.completionCriteria],
      forbiddenActions: [...input.decision.forbiddenActions],
      allowedTargets: [...input.decision.allowedTargets],
      deliveryDestination: input.decision.deliveryDestination,
      approvalRequiredSideEffects: [...input.decision.approvalRequiredSideEffects],
    },
    receiptId: input.receipt.receiptId,
  }
}
