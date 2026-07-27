import type {
  CanonicalWorkAggregate,
  CanonicalWorkTransitionReceipt,
} from "../contracts/canonical-work-aggregate.js"
import {
  CANONICAL_EVENT_RECEIPT_KINDS,
  validateCanonicalWorkReceipt,
  type CanonicalTerminalCause,
  type CanonicalTerminalCauseOutcomeKind,
  type CanonicalWorkReceipt,
} from "../contracts/canonical-work-receipt.js"

const TERMINAL_CAUSE_EVENT_OUTCOMES = Object.freeze({
  INPUT_REQUIRED: "input_required",
  POLICY_BLOCKED: "policy_block",
  RESULT_BLOCKED: "blocked",
  PATHS_EXHAUSTED: "exhausted",
  USER_CANCELLED: "cancelled",
} as const satisfies Partial<Record<
  CanonicalWorkTransitionReceipt["event"],
  CanonicalTerminalCauseOutcomeKind
>>)

type TerminalCauseEvent = keyof typeof TERMINAL_CAUSE_EVENT_OUTCOMES

export type CanonicalTerminalEvidenceResult =
  | {
      status: "available"
      workId: string
      rootRunId: string
      terminalState: Extract<
        CanonicalWorkTransitionReceipt["nextState"],
        "USER_INPUT_REQUIRED" | "BLOCKED" | "EXHAUSTED" | "CANCELLED"
      >
      transition: {
        revision: number
        event: TerminalCauseEvent
        receiptRef: string
      }
      cause: CanonicalTerminalCause
      evidenceFingerprint: string
      evidenceRefs: string[]
    }
  | {
      status: "evidence_missing"
      reasonCode:
        | "canonical_terminal_aggregate_missing"
        | "canonical_terminal_transition_missing"
        | "canonical_terminal_receipt_missing"
        | "canonical_terminal_cause_missing"
    }
  | {
      status: "evidence_invalid"
      reasonCode:
        | "canonical_terminal_receipt_corrupt"
        | "canonical_terminal_receipt_ref_mismatch"
        | "canonical_terminal_receipt_scope_mismatch"
        | "canonical_terminal_receipt_kind_mismatch"
        | "canonical_terminal_receipt_revision_mismatch"
        | "canonical_terminal_cause_outcome_mismatch"
    }

export interface CanonicalTerminalEvidencePort {
  read(workId: string): CanonicalTerminalEvidenceResult
}

export interface CanonicalTerminalEvidenceDependencies {
  loadAggregate(workId: string): CanonicalWorkAggregate | undefined
  loadReceipt(receiptId: string): CanonicalWorkReceipt | undefined
}

function terminalTransition(
  aggregate: CanonicalWorkAggregate,
): CanonicalWorkTransitionReceipt | undefined {
  return [...aggregate.transitions]
    .reverse()
    .find((transition) =>
      Object.prototype.hasOwnProperty.call(TERMINAL_CAUSE_EVENT_OUTCOMES, transition.event),
    )
}

export function createCanonicalTerminalEvidencePort(
  dependencies: CanonicalTerminalEvidenceDependencies,
): CanonicalTerminalEvidencePort {
  return Object.freeze({
    read(workId: string): CanonicalTerminalEvidenceResult {
      const aggregate = dependencies.loadAggregate(workId)
      if (!aggregate) {
        return {
          status: "evidence_missing",
          reasonCode: "canonical_terminal_aggregate_missing",
        }
      }
      const transition = terminalTransition(aggregate)
      if (!transition) {
        return {
          status: "evidence_missing",
          reasonCode: "canonical_terminal_transition_missing",
        }
      }

      let receipt: CanonicalWorkReceipt | undefined
      try {
        receipt = dependencies.loadReceipt(transition.receiptRef)
      } catch {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_corrupt",
        }
      }
      if (!receipt) {
        return {
          status: "evidence_missing",
          reasonCode: "canonical_terminal_receipt_missing",
        }
      }
      if (!validateCanonicalWorkReceipt(receipt).ok) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_corrupt",
        }
      }
      if (receipt.receiptId !== transition.receiptRef) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_ref_mismatch",
        }
      }
      if (receipt.workId !== aggregate.workId) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_scope_mismatch",
        }
      }
      if (receipt.kind !== CANONICAL_EVENT_RECEIPT_KINDS[transition.event]) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_kind_mismatch",
        }
      }
      if (receipt.consumedRevision !== transition.revision) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_receipt_revision_mismatch",
        }
      }
      if (!receipt.terminalCause) {
        return {
          status: "evidence_missing",
          reasonCode: "canonical_terminal_cause_missing",
        }
      }
      const event = transition.event as TerminalCauseEvent
      if (receipt.terminalCause.outcomeKind !== TERMINAL_CAUSE_EVENT_OUTCOMES[event]) {
        return {
          status: "evidence_invalid",
          reasonCode: "canonical_terminal_cause_outcome_mismatch",
        }
      }

      return {
        status: "available",
        workId: aggregate.workId,
        rootRunId: aggregate.rootRunId,
        terminalState: transition.nextState as Extract<
          CanonicalWorkTransitionReceipt["nextState"],
          "USER_INPUT_REQUIRED" | "BLOCKED" | "EXHAUSTED" | "CANCELLED"
        >,
        transition: {
          revision: transition.revision,
          event,
          receiptRef: transition.receiptRef,
        },
        cause: receipt.terminalCause,
        evidenceFingerprint: receipt.evidenceFingerprint,
        evidenceRefs: [...receipt.evidenceRefs],
      }
    },
  })
}
