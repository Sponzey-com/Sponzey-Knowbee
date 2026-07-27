import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
} from "./live-acceptance-bundle.js"
import type { LiveAcceptanceExecutionSelection } from "./live-acceptance-execution-request.js"
import type { LiveAcceptanceRunnerResult } from "./live-acceptance-runner.js"
import {
  type LiveAcceptanceRuntimeSnapshot,
  type LiveAcceptanceSelectionPreflightResult,
  resolveLiveAcceptanceExecutionSelections,
} from "./live-acceptance-selection-preflight.js"

export interface LiveAcceptancePreflightedExecutionInput {
  readonly candidate: Readonly<LiveAcceptanceBundleCandidate>
  readonly approval: Readonly<LiveAcceptanceBundleApproval>
  readonly selection: Readonly<LiveAcceptanceExecutionSelection>
  readonly requestedKeyId: string
  readonly signal: AbortSignal
}

export interface LiveAcceptanceVerifiedExecutionContext {
  readonly candidate: Readonly<LiveAcceptanceBundleCandidate>
  readonly approval: Readonly<LiveAcceptanceBundleApproval>
  readonly requestedKeyId: string
  readonly observedAt: number
  readonly signal: AbortSignal
  readonly preflight: Extract<LiveAcceptanceSelectionPreflightResult, { status: "verified" }>
}

export type LiveAcceptanceVerifiedExecutor = (
  context: LiveAcceptanceVerifiedExecutionContext,
) => Promise<LiveAcceptanceRunnerResult>

export type LiveAcceptancePreflightedExecutor = (
  input: LiveAcceptancePreflightedExecutionInput,
) => Promise<LiveAcceptanceRunnerResult>

function stopped(
  status: "blocked" | "cancelled",
  reasonCode: string,
  validating = false,
): LiveAcceptanceRunnerResult {
  return Object.freeze({
    status,
    blockers: Object.freeze([{ capability: "collection" as const, reasonCode }]),
    events: Object.freeze([
      { state: "initialized" as const },
      ...(validating ? [{ state: "validating" as const }] : []),
      { state: status === "cancelled" ? ("cancelled" as const) : ("blocked" as const) },
    ]),
  })
}

function freezeApproval(
  approval: Readonly<LiveAcceptanceBundleApproval>,
): Readonly<LiveAcceptanceBundleApproval> {
  const roles = [...approval.roles]
  Object.freeze(roles)
  return Object.freeze({ ...approval, roles })
}

export function createPreflightedLiveAcceptanceExecutor(input: {
  readonly now: () => number
  readonly maxYeonjangAgeMs: number
  readonly captureSnapshot: (capturedAt: number) => LiveAcceptanceRuntimeSnapshot
  readonly executeVerified: LiveAcceptanceVerifiedExecutor
}): LiveAcceptancePreflightedExecutor {
  return async (request) => {
    const signal = request.signal
    if (signal.aborted) return stopped("cancelled", "live_collection_cancelled")

    const observedAt = input.now()
    let snapshot: LiveAcceptanceRuntimeSnapshot
    try {
      snapshot = input.captureSnapshot(observedAt)
    } catch {
      return stopped("blocked", "live_preflight_capture_failed")
    }
    if (signal.aborted) return stopped("cancelled", "live_collection_cancelled")

    const preflight = resolveLiveAcceptanceExecutionSelections({
      selection: request.selection,
      snapshot,
      now: observedAt,
      maxYeonjangAgeMs: input.maxYeonjangAgeMs,
    })
    if (preflight.status === "rejected") {
      return stopped("blocked", preflight.reasonCode, true)
    }
    if (signal.aborted) return stopped("cancelled", "live_collection_cancelled", true)

    const context: LiveAcceptanceVerifiedExecutionContext = Object.freeze({
      candidate: Object.freeze({ ...request.candidate }),
      approval: freezeApproval(request.approval),
      requestedKeyId: request.requestedKeyId,
      observedAt,
      signal,
      preflight,
    })
    try {
      return await input.executeVerified(context)
    } catch {
      return stopped("blocked", "live_verified_execution_failed", true)
    }
  }
}
