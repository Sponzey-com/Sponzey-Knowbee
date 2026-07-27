import type { StructuredWorkLifecycleTraceEvent } from "./structured-work-lifecycle.js"

export type ProcessControlMode = "linear" | "state_machine"

export interface ProcessControlSignals {
  recursivePromptImprovement: boolean
  delegation: boolean
  longRunning: boolean
  approvalRequired: boolean
}

export interface ProcessControlDecision {
  mode: ProcessControlMode
  reasonCodes: string[]
  stateStorageRequired: boolean
}

const SIGNAL_REASON_CODES: ReadonlyArray<[keyof ProcessControlSignals, string]> = [
  ["recursivePromptImprovement", "recursive_prompt_improvement_requires_state"],
  ["delegation", "delegation_requires_state"],
  ["longRunning", "long_running_execution_requires_state"],
  ["approvalRequired", "approval_requires_state"],
]

export function decideProcessControlMode(signals: ProcessControlSignals): ProcessControlDecision {
  const reasonCodes = SIGNAL_REASON_CODES
    .filter(([key]) => signals[key])
    .map(([, reasonCode]) => reasonCode)
  if (reasonCodes.length === 0) {
    return { mode: "linear", reasonCodes: ["state_machine_not_required"], stateStorageRequired: false }
  }
  return { mode: "state_machine", reasonCodes, stateStorageRequired: true }
}

export function assertProcessControlMode(
  signals: ProcessControlSignals,
  requestedMode: ProcessControlMode,
): ProcessControlDecision {
  const decision = decideProcessControlMode(signals)
  if (decision.mode === requestedMode) return decision
  if (decision.mode === "linear") throw new Error("Simple work must use linear process control without state storage.")
  throw new Error("A state machine is required for this process control signal set.")
}

export type StructuredTraceLogPurpose = "product" | "field_debug" | "development"
export type StructuredTraceStatus = "running" | "completed" | "partial" | "blocked" | "failed"

export interface ProductTraceLogProjection {
  purpose: "product"
  workId: string
  status: StructuredTraceStatus
  reasonCode: string
}

export interface FieldDebugTraceLogProjection extends Omit<ProductTraceLogProjection, "purpose"> {
  purpose: "field_debug"
  retryCount: number
  transitions: Array<{
    phase: StructuredWorkLifecycleTraceEvent["phase"]
    reasonCode: string
    stepIds: string[]
    referenceIds: string[]
  }>
}

export interface DevelopmentTraceLogProjection extends Omit<FieldDebugTraceLogProjection, "purpose"> {
  purpose: "development"
  developmentIssues: string[]
}

export type StructuredTraceLogProjection =
  | ProductTraceLogProjection
  | FieldDebugTraceLogProjection
  | DevelopmentTraceLogProjection

const STABLE_REASON_CODE = /^[a-z][a-z0-9_]*$/
const TYPED_REDACTED_REFERENCE = /^[a-z][a-z0-9_-]*:[^\s]+$/
const SENSITIVE_PATTERN = /(?:api[_-]?key|access[_-]?token|secret|password|token=|begin (?:rsa |ec |openssh )?private key|raw system prompt|raw tool output|memory:)/i

function requireText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function requireReasonCode(value: string): string {
  const normalized = requireText(value, "Reason code")
  if (!STABLE_REASON_CODE.test(normalized)) throw new Error("Reason code must be a stable snake_case value.")
  return normalized
}

function requireReference(value: string): string {
  const normalized = requireText(value, "Typed redacted reference")
  if (SENSITIVE_PATTERN.test(normalized)) throw new Error("Sensitive reference content is not allowed in trace projections.")
  if (!TYPED_REDACTED_REFERENCE.test(normalized)) {
    throw new Error("Trace projection requires a typed redacted reference.")
  }
  return normalized
}

function uniqueReferences(values: string[]): string[] {
  return [...new Set(values.map(requireReference))]
}

function requireRetryCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error("Retry count must be a non-negative integer.")
  return value
}

export function projectStructuredTraceLog(input: {
  purpose: StructuredTraceLogPurpose
  workId: string
  status: StructuredTraceStatus
  reasonCode: string
  trace: StructuredWorkLifecycleTraceEvent[]
  retryCount: number
  developmentIssues: string[]
}): StructuredTraceLogProjection {
  const product: ProductTraceLogProjection = {
    purpose: "product",
    workId: requireText(input.workId, "Work ID"),
    status: input.status,
    reasonCode: requireReasonCode(input.reasonCode),
  }
  if (input.purpose === "product") return product
  const transitions = input.trace.map((event) => {
    if (event.workId !== product.workId) throw new Error("Trace work ID does not match log work ID.")
    return {
      phase: event.phase,
      reasonCode: requireReasonCode(event.reasonCode),
      stepIds: [...new Set(event.stepIds.map((stepId) => requireText(stepId, "Step ID")))],
      referenceIds: uniqueReferences(event.referenceIds),
    }
  })
  const field: FieldDebugTraceLogProjection = {
    ...product,
    purpose: "field_debug",
    retryCount: requireRetryCount(input.retryCount),
    transitions,
  }
  if (input.purpose === "field_debug") return field
  const developmentIssues = input.developmentIssues.map((value) => {
    const issue = requireText(value, "Development issue")
    if (SENSITIVE_PATTERN.test(issue)) throw new Error("Sensitive content is not allowed in development diagnostics.")
    return issue
  })
  return { ...field, purpose: "development", developmentIssues }
}

export interface UserTraceSummaryProjection {
  workId: string
  status: StructuredTraceStatus
  reasonCode: string
  completedScopeRefs: string[]
  unresolvedScopeRefs: string[]
  nextActionRefs: string[]
  finalResponseLlmRequired: true
}

export function projectUserTraceSummary(input: Omit<UserTraceSummaryProjection, "finalResponseLlmRequired">): UserTraceSummaryProjection {
  return {
    workId: requireText(input.workId, "Work ID"),
    status: input.status,
    reasonCode: requireReasonCode(input.reasonCode),
    completedScopeRefs: uniqueReferences(input.completedScopeRefs),
    unresolvedScopeRefs: uniqueReferences(input.unresolvedScopeRefs),
    nextActionRefs: uniqueReferences(input.nextActionRefs),
    finalResponseLlmRequired: true,
  }
}
