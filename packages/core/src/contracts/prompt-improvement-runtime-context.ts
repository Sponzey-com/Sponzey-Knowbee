export const DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS = [
  "reload",
  "restart",
  "prompt_version_activation",
] as const

export const PROMPT_IMPROVEMENT_REPORT_STATES = [
  "written",
  "validated",
  "activation_pending",
  "activated",
  "rolled_back",
] as const

export type DocumentedPromptRuntimeActivationMethod = typeof DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS[number]
export type PromptImprovementReportState = typeof PROMPT_IMPROVEMENT_REPORT_STATES[number]
export type PromptImprovementReportReceiptKind =
  | "source_written"
  | "validation_passed"
  | "activation_scheduled"
  | "activation_confirmed"
  | "rollback_verified"

export interface PromptImprovementRuntimeContext {
  readonly schemaVersion: 1
  readonly runtimeSnapshotId: string
  readonly capturedAt: number
  readonly promptSourceRoot: string
  readonly promptRegistryHandleId: string
  readonly activeConversationId: string
  readonly activePromptSetFingerprint: string
  readonly promptSourceRefs: readonly string[]
}

export interface PromptImprovementReportReceipt {
  schemaVersion: 1
  kind: PromptImprovementReportReceiptKind
  proposalFingerprint: string
  sourceSetFingerprint: string
  evidenceRef: string
}

export type PromptImprovementRuntimeContextDecision =
  | { status: "bound"; context: PromptImprovementRuntimeContext }
  | { status: "blocked"; reasonCode: "startup_context_invalid" | "prompt_source_root_invalid" | "prompt_source_refs_invalid" }

export type PromptRuntimeActivationDecision =
  | {
      status: "authorized"
      reportState: "activation_pending"
      activation: {
        method: DocumentedPromptRuntimeActivationMethod
        activationRunId: string
        nextRuntimeSnapshotId: string
        nextPromptSetFingerprint: string
      }
      currentConversation: {
        conversationId: string
        promptSetFingerprint: string
        unchanged: true
      }
    }
  | { status: "blocked"; reasonCode: "activation_input_invalid" | "activation_method_invalid" | "startup_context_mismatch" | "current_run_mutation" | "current_snapshot_mutation" | "current_prompt_set_mutation" }

export type PromptImprovementReportTransitionDecision =
  | { status: "authorized"; previousState: PromptImprovementReportState | undefined; nextState: PromptImprovementReportState; evidenceRef: string }
  | { status: "blocked"; reasonCode: "report_receipt_invalid" | "report_lineage_mismatch" | "report_transition_invalid" }

const ABSOLUTE_SOURCE_ROOT = /^(?:\/(?!.*(?:^|\/)\.\.(?:\/|$)).+|[a-zA-Z]:\\(?!.*(?:^|\\)\.\.(?:\\|$)).+)$/u
const REPORT_TRANSITIONS: Readonly<Record<PromptImprovementReportReceiptKind, {
  from: readonly (PromptImprovementReportState | undefined)[]
  to: PromptImprovementReportState
}>> = {
  source_written: { from: [undefined], to: "written" },
  validation_passed: { from: ["written"], to: "validated" },
  activation_scheduled: { from: ["validated"], to: "activation_pending" },
  activation_confirmed: { from: ["activation_pending"], to: "activated" },
  rollback_verified: { from: ["written", "validated", "activation_pending", "activated"], to: "rolled_back" },
}

function exact(value: string): string {
  return value.trim()
}

function uniqueExact(values: readonly string[]): string[] | undefined {
  const normalized = values.map(exact).filter(Boolean)
  if (normalized.length === 0 || normalized.length !== values.length || new Set(normalized).size !== normalized.length) return undefined
  return normalized
}

export function bindPromptImprovementRuntimeContext(
  input: PromptImprovementRuntimeContext,
): PromptImprovementRuntimeContextDecision {
  if (input.schemaVersion !== 1
    || !exact(input.runtimeSnapshotId)
    || !Number.isSafeInteger(input.capturedAt)
    || input.capturedAt < 0
    || !exact(input.promptRegistryHandleId)
    || !exact(input.activeConversationId)
    || !exact(input.activePromptSetFingerprint)) {
    return { status: "blocked", reasonCode: "startup_context_invalid" }
  }
  const promptSourceRoot = exact(input.promptSourceRoot)
  if (!ABSOLUTE_SOURCE_ROOT.test(promptSourceRoot)) {
    return { status: "blocked", reasonCode: "prompt_source_root_invalid" }
  }
  const promptSourceRefs = uniqueExact(input.promptSourceRefs)
  if (!promptSourceRefs) return { status: "blocked", reasonCode: "prompt_source_refs_invalid" }
  const context: PromptImprovementRuntimeContext = Object.freeze({
    schemaVersion: 1,
    runtimeSnapshotId: exact(input.runtimeSnapshotId),
    capturedAt: input.capturedAt,
    promptSourceRoot,
    promptRegistryHandleId: exact(input.promptRegistryHandleId),
    activeConversationId: exact(input.activeConversationId),
    activePromptSetFingerprint: exact(input.activePromptSetFingerprint),
    promptSourceRefs: Object.freeze(promptSourceRefs),
  })
  return { status: "bound", context }
}

export function authorizePromptRuntimeActivation(input: {
  context: PromptImprovementRuntimeContext
  proposalRunId: string
  activationRunId: string
  observedRuntimeSnapshotId: string
  nextRuntimeSnapshotId: string
  observedActivePromptSetFingerprint: string
  nextPromptSetFingerprint: string
  method: DocumentedPromptRuntimeActivationMethod
}): PromptRuntimeActivationDecision {
  const proposalRunId = exact(input.proposalRunId)
  const activationRunId = exact(input.activationRunId)
  const nextRuntimeSnapshotId = exact(input.nextRuntimeSnapshotId)
  const nextPromptSetFingerprint = exact(input.nextPromptSetFingerprint)
  if (!proposalRunId || !activationRunId || !nextRuntimeSnapshotId || !nextPromptSetFingerprint) {
    return { status: "blocked", reasonCode: "activation_input_invalid" }
  }
  if (!(DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS as readonly string[]).includes(input.method)) {
    return { status: "blocked", reasonCode: "activation_method_invalid" }
  }
  if (exact(input.observedRuntimeSnapshotId) !== input.context.runtimeSnapshotId
    || exact(input.observedActivePromptSetFingerprint) !== input.context.activePromptSetFingerprint) {
    return { status: "blocked", reasonCode: "startup_context_mismatch" }
  }
  if (proposalRunId === activationRunId) return { status: "blocked", reasonCode: "current_run_mutation" }
  if (nextRuntimeSnapshotId === input.context.runtimeSnapshotId) return { status: "blocked", reasonCode: "current_snapshot_mutation" }
  if (nextPromptSetFingerprint === input.context.activePromptSetFingerprint) return { status: "blocked", reasonCode: "current_prompt_set_mutation" }
  return {
    status: "authorized",
    reportState: "activation_pending",
    activation: { method: input.method, activationRunId, nextRuntimeSnapshotId, nextPromptSetFingerprint },
    currentConversation: {
      conversationId: input.context.activeConversationId,
      promptSetFingerprint: input.context.activePromptSetFingerprint,
      unchanged: true,
    },
  }
}

export function authorizePromptImprovementReportTransition(input: {
  currentState: PromptImprovementReportState | undefined
  receipt: PromptImprovementReportReceipt
  expectedProposalFingerprint: string
  expectedSourceSetFingerprint: string
}): PromptImprovementReportTransitionDecision {
  const receipt = input.receipt
  if (receipt.schemaVersion !== 1 || !exact(receipt.evidenceRef)
    || !exact(receipt.proposalFingerprint) || !exact(receipt.sourceSetFingerprint)
    || !REPORT_TRANSITIONS[receipt.kind]) {
    return { status: "blocked", reasonCode: "report_receipt_invalid" }
  }
  if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)
    || receipt.sourceSetFingerprint !== exact(input.expectedSourceSetFingerprint)) {
    return { status: "blocked", reasonCode: "report_lineage_mismatch" }
  }
  const transition = REPORT_TRANSITIONS[receipt.kind]
  if (!transition.from.includes(input.currentState)) {
    return { status: "blocked", reasonCode: "report_transition_invalid" }
  }
  return {
    status: "authorized",
    previousState: input.currentState,
    nextState: transition.to,
    evidenceRef: exact(receipt.evidenceRef),
  }
}
