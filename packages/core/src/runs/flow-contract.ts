import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkState } from "../contracts/canonical-work-state.js"
import type { RunScope, RunStatus } from "./types.js"

export type RequestExecutionOutcomeStatus =
  | "in_progress"
  | "awaiting_approval"
  | "awaiting_user"
  | "succeeded"
  | "partially_succeeded"
  | "blocked"
  | "exhausted"
  | "cancelled"
  | "internal_fault"

export type RequestDeliveryOutcomeStatus =
  | "not_started"
  | "pending"
  | "delivered"
  | "failed"

export type RunFlowStatusTransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

export interface RunFlowIdentifiers {
  runId: string
  sessionId: string
  requestGroupId: string
  lineageRootRunId: string
  runScope: RunScope
  parentRunId?: string
  scheduleId?: string
}

export interface RequestExecutionOutcome {
  executionStatus: RequestExecutionOutcomeStatus
  deliveryStatus: RequestDeliveryOutcomeStatus
}

export const TERMINAL_RUN_STATUSES = ["completed", "failed", "cancelled", "interrupted"] as const satisfies RunStatus[]

const terminalRunStatusSet = new Set<RunStatus>(TERMINAL_RUN_STATUSES)

export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatusSet.has(status)
}

export function canTransitionRunStatus(currentStatus: RunStatus, nextStatus: RunStatus): RunFlowStatusTransitionDecision {
  if (currentStatus === nextStatus) return { allowed: true }

  if (isTerminalRunStatus(currentStatus)) {
    return {
      allowed: false,
      reason: `terminal_status_locked:${currentStatus}->${nextStatus}`,
    }
  }

  return { allowed: true }
}

export function resolveRunFlowIdentifiers(params: {
  runId: string
  sessionId: string
  requestGroupId?: string | undefined
  lineageRootRunId?: string | undefined
  parentRunId?: string | undefined
  runScope?: RunScope | undefined
  scheduleId?: string | undefined
}): RunFlowIdentifiers {
  const requestGroupId = params.requestGroupId?.trim() || params.runId
  const lineageRootRunId = params.lineageRootRunId?.trim() || requestGroupId
  const runScope = params.runScope ?? (params.parentRunId ? "child" : "root")

  return {
    runId: params.runId,
    sessionId: params.sessionId,
    requestGroupId,
    lineageRootRunId,
    runScope,
    ...(params.parentRunId?.trim() ? { parentRunId: params.parentRunId.trim() } : {}),
    ...(params.scheduleId?.trim() ? { scheduleId: params.scheduleId.trim() } : {}),
  }
}

function effectiveCanonicalOutcomeState(
  aggregate: CanonicalWorkAggregate,
): CanonicalWorkState | undefined {
  if (aggregate.state !== "USER_REPORT") return aggregate.state
  const reportTransition = aggregate.transitions[aggregate.transitions.length - 1]
  if (reportTransition?.event !== "REPORT_DELIVERED") return undefined
  return reportTransition.previousState
}

function executionStatusForCanonicalState(
  state: CanonicalWorkState | undefined,
  runStatus: RunStatus,
): RequestExecutionOutcomeStatus {
  if (!state) return "internal_fault"

  switch (state) {
    case "USER_INPUT_REQUIRED":
      return runStatus === "awaiting_approval" ? "awaiting_approval" : "awaiting_user"
    case "SUCCEEDED":
      return "succeeded"
    case "PARTIALLY_SUCCEEDED":
      return "partially_succeeded"
    case "BLOCKED":
      return "blocked"
    case "EXHAUSTED":
      return "exhausted"
    case "CANCELLED":
      return "cancelled"
    case "USER_REPORT":
      return "internal_fault"
    default:
      return runStatus === "failed" || runStatus === "cancelled" || runStatus === "interrupted"
        ? "internal_fault"
        : "in_progress"
  }
}

export function projectRequestExecutionOutcome(input: {
  aggregate: CanonicalWorkAggregate
  runStatus: RunStatus
  deliveryStatus: RequestDeliveryOutcomeStatus
}): RequestExecutionOutcome {
  return {
    executionStatus: executionStatusForCanonicalState(
      effectiveCanonicalOutcomeState(input.aggregate),
      input.runStatus,
    ),
    deliveryStatus: input.deliveryStatus,
  }
}
