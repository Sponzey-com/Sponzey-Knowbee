import type { CanonicalWorkState } from "../contracts/canonical-work-state.js"
import type { RunStatus } from "./types.js"

export type CanonicalWaitingKind = "approval" | "user_input"
export type CanonicalFinalOutcome = "succeeded" | "partial" | "blocked" | "exhausted" | "cancelled"

export interface CanonicalRunStatusProjection {
  canonicalState: CanonicalWorkState
  runStatus: RunStatus
  lossy: true
}

export type CanonicalRunStatusProjectionResult =
  | { ok: true; projection: CanonicalRunStatusProjection }
  | {
      ok: false
      canonicalState: CanonicalWorkState
      reasonCode: "waiting_kind_required" | "final_report_outcome_required"
    }

export function projectCanonicalWorkStateToRunStatus(input: {
  state: CanonicalWorkState
  waitingKind?: CanonicalWaitingKind
  finalOutcome?: CanonicalFinalOutcome
}): CanonicalRunStatusProjectionResult {
  let runStatus: RunStatus

  switch (input.state) {
    case "REQUEST_RECEIVED":
      runStatus = "queued"
      break
    case "SOLUTION_ANALYZED":
    case "POLICY_VALIDATED":
    case "EXECUTING":
    case "RESULT_REVIEW":
    case "SUCCEEDED":
    case "PARTIALLY_SUCCEEDED":
    case "BLOCKED":
    case "EXHAUSTED":
      runStatus = "running"
      break
    case "AWAITING_APPROVAL":
      runStatus = "awaiting_approval"
      break
    case "USER_INPUT_REQUIRED":
      if (!input.waitingKind) {
        return { ok: false, canonicalState: input.state, reasonCode: "waiting_kind_required" }
      }
      runStatus = input.waitingKind === "approval" ? "awaiting_approval" : "awaiting_user"
      break
    case "CANCELLED":
      runStatus = "cancelled"
      break
    case "USER_REPORT":
      if (!input.finalOutcome) {
        return { ok: false, canonicalState: input.state, reasonCode: "final_report_outcome_required" }
      }
      runStatus = input.finalOutcome === "succeeded" || input.finalOutcome === "partial"
        ? "completed"
        : input.finalOutcome === "cancelled"
          ? "cancelled"
          : "failed"
      break
  }

  return {
    ok: true,
    projection: {
      canonicalState: input.state,
      runStatus,
      lossy: true,
    },
  }
}
