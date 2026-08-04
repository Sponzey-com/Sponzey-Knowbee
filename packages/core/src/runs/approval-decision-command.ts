import type {
  ApprovalDecision,
  ApprovalResolutionReason,
} from "../events/index.js"
import type {
  ApprovalOperationBinding,
  ApprovalRegistryDecisionResult,
  ApprovalRegistryRow,
} from "./approval-registry.js"
import {
  buildApprovedOperationResumeCommand,
  type ApprovedOperationResumeCommand,
} from "./approved-operation-resume.js"
import type { EnqueueApprovedOperationContinuationResult } from "./approved-operation-continuation.js"
import type { CanonicalApprovalEvent } from "./canonical-approval-transition.js"

export interface ResolveApprovalDecisionCommand {
  readonly approvalId: string
  readonly runId: string
  readonly decision: ApprovalDecision
  readonly decisionBy: string
  readonly decisionSource: ApprovalResolutionReason
  readonly now?: number
}

export type ResolveApprovalDecisionCommandResult =
  | {
      readonly accepted: true
      readonly row: ApprovalRegistryRow
      readonly decision: ApprovalDecision
      readonly resumeCommand?: ApprovedOperationResumeCommand
      readonly continuationId?: string
      readonly canonicalOwned: boolean
    }
  | {
      readonly accepted: false
      readonly reasonCode:
        | "approval_not_found"
        | "approval_run_mismatch"
        | "approval_already_final"
        | "approval_decision_rejected"
        | "approval_consumption_rejected"
        | "approval_operation_binding_invalid"
        | "approval_continuation_enqueue_rejected"
        | "canonical_approval_transition_rejected"
    }

export interface ResolveApprovalDecisionDependencies {
  readonly loadApproval: (approvalId: string) => ApprovalRegistryRow | undefined
  readonly resolveDecision: (input: {
    approvalId: string
    decision: ApprovalDecision
    decisionBy: string
    decisionSource: ApprovalResolutionReason
    now?: number
  }) => ApprovalRegistryDecisionResult
  readonly consumeDecision: (
    approvalId: string,
    now?: number,
  ) => ApprovalRegistryDecisionResult
  readonly recordCanonicalLifecycle: (input: {
    runId: string
    approvalId: string
    event: CanonicalApprovalEvent
    operationBinding: ApprovalOperationBinding
  }) => "applied" | "compatibility" | "failed"
  readonly enqueueContinuation: (
    command: ApprovedOperationResumeCommand,
    now?: number,
  ) => EnqueueApprovedOperationContinuationResult
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u

function operationBindingFromRow(
  row: ApprovalRegistryRow,
): ApprovalOperationBinding | null | "invalid" {
  const hasAnyBinding =
    row.operation_id !== null
    || row.operation_binding_hash !== null
    || row.continuation_schema_version !== null
  if (!hasAnyBinding) return null
  if (
    !row.operation_id?.trim()
    || !row.operation_binding_hash
    || !HASH_PATTERN.test(row.operation_binding_hash)
    || row.continuation_schema_version !== 1
  ) {
    return "invalid"
  }
  return Object.freeze({
    operationId: row.operation_id,
    operationBindingHash:
      row.operation_binding_hash as `sha256:${string}`,
    continuationSchemaVersion: 1,
  })
}

export function resolveApprovalDecisionCommand(
  command: ResolveApprovalDecisionCommand,
  dependencies: ResolveApprovalDecisionDependencies,
): ResolveApprovalDecisionCommandResult {
  const current = dependencies.loadApproval(command.approvalId)
  if (!current) return { accepted: false, reasonCode: "approval_not_found" }
  if (current.run_id !== command.runId) {
    return { accepted: false, reasonCode: "approval_run_mismatch" }
  }
  if (current.status !== "requested") {
    return { accepted: false, reasonCode: "approval_already_final" }
  }

  const operationBinding = operationBindingFromRow(current)
  if (operationBinding === "invalid") {
    return {
      accepted: false,
      reasonCode: "approval_operation_binding_invalid",
    }
  }
  const resolved = dependencies.resolveDecision({
    approvalId: command.approvalId,
    decision: command.decision,
    decisionBy: command.decisionBy,
    decisionSource: command.decisionSource,
    ...(command.now === undefined ? {} : { now: command.now }),
  })
  if (!resolved.accepted || !resolved.row) {
    return { accepted: false, reasonCode: "approval_decision_rejected" }
  }

  let row = resolved.row
  let resumeCommand: ApprovedOperationResumeCommand | undefined
  let continuationId: string | undefined
  if (command.decision !== "deny") {
    const consumed = dependencies.consumeDecision(
      command.approvalId,
      command.now,
    )
    if (!consumed.accepted || !consumed.row) {
      return { accepted: false, reasonCode: "approval_consumption_rejected" }
    }
    row = consumed.row
    if (operationBinding) {
      const built = buildApprovedOperationResumeCommand({
        row,
        decision: command.decision,
        expectedBinding: operationBinding,
      })
      if (built.status === "rejected") {
        return {
          accepted: false,
          reasonCode: "approval_operation_binding_invalid",
        }
      }
      resumeCommand = built.command
      const queued = dependencies.enqueueContinuation(
        resumeCommand,
        command.now,
      )
      if (queued.status === "rejected") {
        return {
          accepted: false,
          reasonCode: "approval_continuation_enqueue_rejected",
        }
      }
      continuationId = queued.continuation.continuationId
    }
  }

  const canonicalEvent: CanonicalApprovalEvent =
    command.decision === "deny"
      ? "APPROVAL_DENIED_OR_EXPIRED"
      : "APPROVAL_CONSUMED"
  const canonical = operationBinding
    ? dependencies.recordCanonicalLifecycle({
        runId: command.runId,
        approvalId: command.approvalId,
        event: canonicalEvent,
        operationBinding,
      })
    : "compatibility"
  if (canonical === "failed") {
    return {
      accepted: false,
      reasonCode: "canonical_approval_transition_rejected",
    }
  }

  return {
    accepted: true,
    row,
    decision: command.decision,
    ...(resumeCommand ? { resumeCommand } : {}),
    ...(continuationId ? { continuationId } : {}),
    canonicalOwned: canonical === "applied",
  }
}
