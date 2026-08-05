import type { UserRecoveryProjection } from "./user-recovery"

export type InputSubmissionState =
  | { status: "idle"; sequence: number; draft: ""; recovery: null }
  | { status: "submitting"; sequence: number; draft: string; recovery: null }
  | { status: "failed"; sequence: number; draft: string; recovery: UserRecoveryProjection }

export type InputSubmissionEvent =
  | { type: "submit_started"; sequence: number; draft: string }
  | { type: "submit_succeeded"; sequence: number }
  | { type: "submit_failed"; sequence: number; recovery: UserRecoveryProjection }
  | { type: "reset"; sequence: number }

export const initialInputSubmission: InputSubmissionState = {
  status: "idle",
  sequence: 0,
  draft: "",
  recovery: null,
}

export function reduceInputSubmission(
  state: InputSubmissionState,
  event: InputSubmissionEvent,
): InputSubmissionState {
  if (event.type === "submit_started") {
    if (state.status === "submitting") throw new Error("Input submission is already active")
    return {
      status: "submitting",
      sequence: event.sequence,
      draft: event.draft,
      recovery: null,
    }
  }
  if (event.type === "reset") return { ...initialInputSubmission, sequence: event.sequence }
  if (event.sequence !== state.sequence || state.status !== "submitting") return state
  if (event.type === "submit_succeeded") {
    return { ...initialInputSubmission, sequence: event.sequence }
  }
  return {
    status: "failed",
    sequence: event.sequence,
    draft: state.draft,
    recovery: event.recovery,
  }
}
