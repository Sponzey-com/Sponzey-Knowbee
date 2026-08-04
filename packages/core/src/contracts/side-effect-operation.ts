export const SIDE_EFFECT_OPERATION_STATES = [
  "RESERVED",
  "EFFECT_STARTED",
  "EFFECT_REJECTED",
  "EFFECT_RECORDED",
  "VERIFYING",
  "VERIFIED",
  "VERIFY_FAILED",
  "CANCEL_REQUESTED",
  "COMPENSATING",
  "COMPENSATED",
  "MANUAL_INTERVENTION",
] as const

export type SideEffectOperationState = (typeof SIDE_EFFECT_OPERATION_STATES)[number]

export const SIDE_EFFECT_OPERATION_EVENTS = [
  "START_EFFECT",
  "RECORD_REJECTION",
  "RECORD_EFFECT",
  "BEGIN_VERIFICATION",
  "VERIFICATION_PASSED",
  "VERIFICATION_FAILED",
  "REQUEST_CANCEL",
  "BEGIN_COMPENSATION",
  "COMPENSATION_SUCCEEDED",
  "COMPENSATION_FAILED",
  "MARK_MANUAL",
] as const

export type SideEffectOperationEvent = (typeof SIDE_EFFECT_OPERATION_EVENTS)[number]

export const SIDE_EFFECT_RECEIPT_KINDS = [
  "authorization",
  "effect",
  "observation",
  "cancellation",
  "compensation",
  "manual",
] as const

export type SideEffectReceiptKind = (typeof SIDE_EFFECT_RECEIPT_KINDS)[number]

export const SIDE_EFFECT_EVENT_RECEIPT_KIND: Readonly<
  Record<SideEffectOperationEvent, SideEffectReceiptKind>
> = Object.freeze({
  START_EFFECT: "authorization",
  RECORD_REJECTION: "effect",
  RECORD_EFFECT: "effect",
  BEGIN_VERIFICATION: "observation",
  VERIFICATION_PASSED: "observation",
  VERIFICATION_FAILED: "observation",
  REQUEST_CANCEL: "cancellation",
  BEGIN_COMPENSATION: "compensation",
  COMPENSATION_SUCCEEDED: "compensation",
  COMPENSATION_FAILED: "compensation",
  MARK_MANUAL: "manual",
})

export interface SideEffectOperationReceipt {
  schemaVersion: 1
  receiptId: string
  operationId: string
  workId: string
  event: SideEffectOperationEvent
  kind: SideEffectReceiptKind
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
  operationRevision: number
  issuedAt: number
}

export const SIDE_EFFECT_CLASSES = [
  "read_only",
  "local_write",
  "external_write",
  "destructive",
  "financial",
] as const

export type SideEffectClass = (typeof SIDE_EFFECT_CLASSES)[number]

const STATE_CHANGING_SIDE_EFFECT_CLASSES = new Set<SideEffectClass>([
  "local_write",
  "external_write",
  "destructive",
  "financial",
])

export interface SideEffectOperationIdentity {
  operationId: string
  scopeId: string
  runId: string
  workId: string
  stepKey: string
  adapterId: string
  targetFingerprint: `sha256:${string}`
  paramsFingerprint: `sha256:${string}`
}

export interface PreparedSideEffectOperation {
  readonly schemaVersion: 1
  readonly identity: Readonly<SideEffectOperationIdentity>
  readonly operationBindingHash: `sha256:${string}`
  readonly resolvedTargetFingerprint: `sha256:${string}`
  readonly effectFingerprint: `sha256:${string}`
}

export interface SideEffectOperationAuthorization {
  authorized: true
  policyDecisionId: string
  policyReceiptRef: string
  operationId: string
  runId: string
  adapterId: string
  effectClass: Exclude<SideEffectClass, "read_only">
  targetFingerprint: `sha256:${string}`
  paramsFingerprint: `sha256:${string}`
  scopeFingerprint: `sha256:${string}`
  expectedEffectFingerprint: `sha256:${string}`
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

export function validateSideEffectOperationReceipt(input: {
  receipt: SideEffectOperationReceipt
  identity: SideEffectOperationIdentity
  event: SideEffectOperationEvent
  operationRevision: number
}): { ok: true } | { ok: false; reasonCode: string } {
  const { receipt } = input
  if (
    receipt.schemaVersion !== 1 ||
    !receipt.receiptId.trim() ||
    receipt.operationId !== input.identity.operationId ||
    receipt.workId !== input.identity.workId ||
    receipt.event !== input.event ||
    receipt.kind !== SIDE_EFFECT_EVENT_RECEIPT_KIND[input.event] ||
    receipt.operationRevision !== input.operationRevision ||
    !Number.isSafeInteger(receipt.operationRevision) ||
    receipt.operationRevision <= 0 ||
    !Number.isSafeInteger(receipt.issuedAt) ||
    receipt.issuedAt < 0 ||
    !HASH_PATTERN.test(receipt.evidenceFingerprint) ||
    receipt.evidenceRefs.length === 0 ||
    receipt.evidenceRefs.some((ref) => !ref.trim()) ||
    new Set(receipt.evidenceRefs).size !== receipt.evidenceRefs.length
  ) {
    return { ok: false, reasonCode: "side_effect_receipt_invalid" }
  }
  return { ok: true }
}

export function buildSideEffectOperationReceipt(input: {
  identity: SideEffectOperationIdentity
  event: SideEffectOperationEvent
  operationRevision: number
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
  issuedAt: number
}): SideEffectOperationReceipt {
  const receipt: SideEffectOperationReceipt = {
    schemaVersion: 1,
    receiptId: `side-effect-receipt:${encodeURIComponent(input.identity.operationId)}:${input.operationRevision}:${input.evidenceFingerprint.slice(-24)}`,
    operationId: input.identity.operationId,
    workId: input.identity.workId,
    event: input.event,
    kind: SIDE_EFFECT_EVENT_RECEIPT_KIND[input.event],
    evidenceFingerprint: input.evidenceFingerprint,
    evidenceRefs: [...new Set(input.evidenceRefs)],
    operationRevision: input.operationRevision,
    issuedAt: input.issuedAt,
  }
  const validation = validateSideEffectOperationReceipt({
    receipt,
    identity: input.identity,
    event: input.event,
    operationRevision: input.operationRevision,
  })
  if (!validation.ok) throw new Error(validation.reasonCode)
  return receipt
}

export function buildSideEffectOperationIdentity(
  input: Omit<SideEffectOperationIdentity, "operationId" | "scopeId">,
): SideEffectOperationIdentity {
  const runId = required(input.runId, "Run ID")
  const workId = required(input.workId, "Work ID")
  const stepKey = required(input.stepKey, "Step key")
  const adapterId = required(input.adapterId, "Adapter ID")
  if (!HASH_PATTERN.test(input.targetFingerprint) || !HASH_PATTERN.test(input.paramsFingerprint)) {
    throw new Error("Side-effect operation fingerprints must be SHA-256 references.")
  }
  return {
    scopeId: `operation-scope:${runId}:${stepKey}:${encodeURIComponent(adapterId)}:${input.targetFingerprint.slice(-16)}`,
    operationId: `operation:${runId}:${stepKey}:${encodeURIComponent(adapterId)}:${input.targetFingerprint.slice(-16)}:${input.paramsFingerprint.slice(-16)}`,
    runId,
    workId,
    stepKey,
    adapterId,
    targetFingerprint: input.targetFingerprint,
    paramsFingerprint: input.paramsFingerprint,
  }
}

export function buildPreparedSideEffectOperation(input: {
  identity: SideEffectOperationIdentity
  operationBindingHash: `sha256:${string}`
}): PreparedSideEffectOperation {
  if (!HASH_PATTERN.test(input.operationBindingHash)) {
    throw new Error("Prepared side-effect operation binding must be a SHA-256 reference.")
  }
  const identity = Object.freeze({ ...input.identity })
  return Object.freeze({
    schemaVersion: 1 as const,
    identity,
    operationBindingHash: input.operationBindingHash,
    resolvedTargetFingerprint: identity.targetFingerprint,
    effectFingerprint: identity.paramsFingerprint,
  })
}

export function buildSideEffectOperationAuthorization(input: {
  identity: SideEffectOperationIdentity
  policyDecisionId: string
  policyReceiptRef: string
  effectClass: Exclude<SideEffectClass, "read_only">
  scopeFingerprint: `sha256:${string}`
  expectedEffectFingerprint: `sha256:${string}`
}): SideEffectOperationAuthorization {
  if (!STATE_CHANGING_SIDE_EFFECT_CLASSES.has(input.effectClass)) {
    throw new Error("Side-effect authorization requires a state-changing effect class.")
  }
  if (
    !HASH_PATTERN.test(input.scopeFingerprint) ||
    !HASH_PATTERN.test(input.expectedEffectFingerprint)
  ) {
    throw new Error("Side-effect authorization fingerprints must be SHA-256 references.")
  }
  return Object.freeze({
    authorized: true,
    policyDecisionId: required(input.policyDecisionId, "Policy decision ID"),
    policyReceiptRef: required(input.policyReceiptRef, "Policy receipt reference"),
    operationId: input.identity.operationId,
    runId: input.identity.runId,
    adapterId: input.identity.adapterId,
    effectClass: input.effectClass,
    targetFingerprint: input.identity.targetFingerprint,
    paramsFingerprint: input.identity.paramsFingerprint,
    scopeFingerprint: input.scopeFingerprint,
    expectedEffectFingerprint: input.expectedEffectFingerprint,
  })
}

export function validateSideEffectOperationAuthorization(input: {
  identity: SideEffectOperationIdentity
  authorization: SideEffectOperationAuthorization | undefined
}):
  | { authorized: true; authorization: SideEffectOperationAuthorization }
  | { authorized: false; reasonCode: string } {
  const authorization = input.authorization
  if (!authorization) return { authorized: false, reasonCode: "side_effect_authorization_required" }
  if (
    authorization.operationId !== input.identity.operationId ||
    authorization.runId !== input.identity.runId ||
    authorization.adapterId !== input.identity.adapterId ||
    authorization.targetFingerprint !== input.identity.targetFingerprint ||
    authorization.paramsFingerprint !== input.identity.paramsFingerprint
  ) {
    return { authorized: false, reasonCode: "side_effect_authorization_scope_mismatch" }
  }
  if (
    !authorization.policyDecisionId.trim() ||
    !authorization.policyReceiptRef.trim() ||
    !HASH_PATTERN.test(authorization.scopeFingerprint) ||
    !HASH_PATTERN.test(authorization.expectedEffectFingerprint)
  ) {
    return { authorized: false, reasonCode: "side_effect_authorization_invalid" }
  }
  return { authorized: true, authorization }
}

type TransitionTable = Readonly<
  Record<
    SideEffectOperationState,
    Readonly<Partial<Record<SideEffectOperationEvent, SideEffectOperationState>>>
  >
>

const TRANSITIONS: TransitionTable = Object.freeze({
  RESERVED: Object.freeze({ START_EFFECT: "EFFECT_STARTED", REQUEST_CANCEL: "CANCEL_REQUESTED" }),
  EFFECT_STARTED: Object.freeze({
    RECORD_REJECTION: "EFFECT_REJECTED",
    RECORD_EFFECT: "EFFECT_RECORDED",
    REQUEST_CANCEL: "CANCEL_REQUESTED",
  }),
  EFFECT_REJECTED: Object.freeze({}),
  EFFECT_RECORDED: Object.freeze({
    BEGIN_VERIFICATION: "VERIFYING",
    REQUEST_CANCEL: "CANCEL_REQUESTED",
  }),
  VERIFYING: Object.freeze({
    VERIFICATION_PASSED: "VERIFIED",
    VERIFICATION_FAILED: "VERIFY_FAILED",
    REQUEST_CANCEL: "CANCEL_REQUESTED",
  }),
  VERIFIED: Object.freeze({}),
  VERIFY_FAILED: Object.freeze({
    BEGIN_COMPENSATION: "COMPENSATING",
    MARK_MANUAL: "MANUAL_INTERVENTION",
  }),
  CANCEL_REQUESTED: Object.freeze({
    BEGIN_VERIFICATION: "VERIFYING",
    BEGIN_COMPENSATION: "COMPENSATING",
    MARK_MANUAL: "MANUAL_INTERVENTION",
  }),
  COMPENSATING: Object.freeze({
    COMPENSATION_SUCCEEDED: "COMPENSATED",
    COMPENSATION_FAILED: "MANUAL_INTERVENTION",
  }),
  COMPENSATED: Object.freeze({}),
  MANUAL_INTERVENTION: Object.freeze({}),
})

const TERMINAL_STATES = new Set<SideEffectOperationState>([
  "VERIFIED",
  "COMPENSATED",
  "MANUAL_INTERVENTION",
  "EFFECT_REJECTED",
])

export type SideEffectOperationTransitionDecision =
  | {
      accepted: true
      previousState: SideEffectOperationState
      event: SideEffectOperationEvent
      nextState: SideEffectOperationState
      receiptRef: string
    }
  | {
      accepted: false
      state: SideEffectOperationState
      event: SideEffectOperationEvent
      reasonCode: "receipt_required" | "transition_not_allowed" | "terminal_state_locked"
    }

export function transitionSideEffectOperation(input: {
  state: SideEffectOperationState
  event: SideEffectOperationEvent
  receiptRef: string
}): SideEffectOperationTransitionDecision {
  const receiptRef = input.receiptRef.trim()
  if (!receiptRef)
    return {
      accepted: false,
      state: input.state,
      event: input.event,
      reasonCode: "receipt_required",
    }
  if (TERMINAL_STATES.has(input.state)) {
    return {
      accepted: false,
      state: input.state,
      event: input.event,
      reasonCode: "terminal_state_locked",
    }
  }
  const nextState = TRANSITIONS[input.state][input.event]
  if (!nextState)
    return {
      accepted: false,
      state: input.state,
      event: input.event,
      reasonCode: "transition_not_allowed",
    }
  return {
    accepted: true,
    previousState: input.state,
    event: input.event,
    nextState,
    receiptRef,
  }
}
