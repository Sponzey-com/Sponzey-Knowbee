import {
  type SideEffectOperationEvent,
  type SideEffectOperationIdentity,
  type PreparedSideEffectOperation,
  type SideEffectOperationReceipt,
  type SideEffectOperationState,
  transitionSideEffectOperation,
  validateSideEffectOperationReceipt,
} from "../contracts/side-effect-operation.js"

export interface SideEffectOperationTransitionRecord {
  revision: number
  previousState: SideEffectOperationState
  event: SideEffectOperationEvent
  nextState: SideEffectOperationState
  receiptRef: string
}

export interface SideEffectOperationAggregate {
  identity: SideEffectOperationIdentity
  state: SideEffectOperationState
  revision: number
  transitions: SideEffectOperationTransitionRecord[]
}

export interface SideEffectOperationRepository {
  loadByScope(scopeId: string): SideEffectOperationAggregate | undefined
  create(
    aggregate: SideEffectOperationAggregate,
  ): { created: true } | { created: false; reasonCode: "scope_conflict" }
  loadReceipt(receiptId: string): SideEffectOperationReceipt | undefined
  saveTransition(input: {
    aggregate: SideEffectOperationAggregate
    expectedRevision: number
    receipt: SideEffectOperationReceipt
  }):
    | { saved: true }
    | {
        saved: false
        reasonCode: "revision_conflict" | "receipt_conflict" | "receipt_invalid"
        currentRevision: number
      }
}

function sameIdentity(
  left: SideEffectOperationIdentity,
  right: SideEffectOperationIdentity,
): boolean {
  return (
    left.operationId === right.operationId &&
    left.scopeId === right.scopeId &&
    left.runId === right.runId &&
    left.workId === right.workId &&
    left.stepKey === right.stepKey &&
    left.adapterId === right.adapterId &&
    left.targetFingerprint === right.targetFingerprint &&
    left.paramsFingerprint === right.paramsFingerprint
  )
}

export type ReserveSideEffectOperationResult =
  | { status: "reserved" | "existing"; aggregate: SideEffectOperationAggregate }
  | {
      status: "rejected"
      reasonCode: "operation_scope_params_conflict" | "operation_scope_persistence_conflict"
    }

type PreparedSideEffectOperationAdmissionStatus =
  | "reserved_new"
  | "reserved_existing"
  | "verified_existing"
  | "compensated_existing"
  | "effect_rejected_existing"
  | "manual_intervention_existing"
  | "active_existing"

type PreparedSideEffectOperationAdmission = {
  [Status in PreparedSideEffectOperationAdmissionStatus]: {
    status: Status
    prepared: PreparedSideEffectOperation
    aggregate: SideEffectOperationAggregate
  }
}[PreparedSideEffectOperationAdmissionStatus]

export type PrepareSideEffectOperationResult =
  | PreparedSideEffectOperationAdmission
  | {
      status: "rejected"
      reasonCode: Extract<ReserveSideEffectOperationResult, { status: "rejected" }>["reasonCode"]
    }

export function prepareSideEffectOperation(input: {
  repository: SideEffectOperationRepository
  prepared: PreparedSideEffectOperation
}): PrepareSideEffectOperationResult {
  const reservation = reserveSideEffectOperation({
    repository: input.repository,
    identity: input.prepared.identity,
  })
  if (reservation.status === "rejected") return reservation
  if (reservation.status === "reserved") {
    return {
      status: "reserved_new",
      prepared: input.prepared,
      aggregate: reservation.aggregate,
    }
  }

  const status = (() => {
    switch (reservation.aggregate.state) {
      case "RESERVED":
        return "reserved_existing" as const
      case "VERIFIED":
        return "verified_existing" as const
      case "COMPENSATED":
        return "compensated_existing" as const
      case "EFFECT_REJECTED":
        return "effect_rejected_existing" as const
      case "MANUAL_INTERVENTION":
        return "manual_intervention_existing" as const
      default:
        return "active_existing" as const
    }
  })()
  return {
    status,
    prepared: input.prepared,
    aggregate: reservation.aggregate,
  }
}

export function reserveSideEffectOperation(input: {
  repository: SideEffectOperationRepository
  identity: SideEffectOperationIdentity
}): ReserveSideEffectOperationResult {
  const current = input.repository.loadByScope(input.identity.scopeId)
  if (current) {
    return sameIdentity(current.identity, input.identity)
      ? { status: "existing", aggregate: current }
      : { status: "rejected", reasonCode: "operation_scope_params_conflict" }
  }
  const aggregate: SideEffectOperationAggregate = {
    identity: input.identity,
    state: "RESERVED",
    revision: 0,
    transitions: [],
  }
  const created = input.repository.create(aggregate)
  if (created.created) return { status: "reserved", aggregate }
  const raced = input.repository.loadByScope(input.identity.scopeId)
  if (!raced) return { status: "rejected", reasonCode: "operation_scope_persistence_conflict" }
  return sameIdentity(raced.identity, input.identity)
    ? { status: "existing", aggregate: raced }
    : { status: "rejected", reasonCode: "operation_scope_params_conflict" }
}

export type TransitionSideEffectOperationResult =
  | { status: "applied"; aggregate: SideEffectOperationAggregate }
  | {
      status: "rejected"
      reasonCode:
        | "operation_not_found"
        | "operation_identity_mismatch"
        | "stale_revision"
        | "receipt_required"
        | "transition_not_allowed"
        | "terminal_state_locked"
        | "revision_conflict"
        | "typed_receipt_required"
        | "receipt_conflict"
        | "receipt_invalid"
      currentRevision?: number
    }

export function transitionReservedSideEffectOperation(input: {
  repository: SideEffectOperationRepository
  operationId: string
  scopeId: string
  expectedRevision: number
  event: SideEffectOperationEvent
  receipt: SideEffectOperationReceipt
}): TransitionSideEffectOperationResult {
  const current = input.repository.loadByScope(input.scopeId)
  if (!current) return { status: "rejected", reasonCode: "operation_not_found" }
  if (current.identity.operationId !== input.operationId) {
    return { status: "rejected", reasonCode: "operation_identity_mismatch" }
  }
  if (current.revision === input.expectedRevision + 1) {
    const last = current.transitions.at(-1)
    const persisted = input.repository.loadReceipt(input.receipt.receiptId)
    if (last?.event === input.event && last.receiptRef === input.receipt.receiptId) {
      return persisted && JSON.stringify(persisted) === JSON.stringify(input.receipt)
        ? { status: "applied", aggregate: current }
        : { status: "rejected", reasonCode: "receipt_conflict" }
    }
  }
  if (current.revision !== input.expectedRevision) {
    return { status: "rejected", reasonCode: "stale_revision", currentRevision: current.revision }
  }
  const revision = current.revision + 1
  const receiptValidation = validateSideEffectOperationReceipt({
    receipt: input.receipt,
    identity: current.identity,
    event: input.event,
    operationRevision: revision,
  })
  if (!receiptValidation.ok) return { status: "rejected", reasonCode: "receipt_invalid" }
  const decision = transitionSideEffectOperation({
    state: current.state,
    event: input.event,
    receiptRef: input.receipt.receiptId,
  })
  if (!decision.accepted) return { status: "rejected", reasonCode: decision.reasonCode }
  const aggregate: SideEffectOperationAggregate = {
    ...current,
    state: decision.nextState,
    revision,
    transitions: [
      ...current.transitions,
      {
        revision,
        previousState: decision.previousState,
        event: decision.event,
        nextState: decision.nextState,
        receiptRef: decision.receiptRef,
      },
    ],
  }
  const saved = input.repository.saveTransition({
    aggregate,
    expectedRevision: input.expectedRevision,
    receipt: input.receipt,
  })
  return saved.saved
    ? { status: "applied", aggregate }
    : { status: "rejected", reasonCode: saved.reasonCode, currentRevision: saved.currentRevision }
}
