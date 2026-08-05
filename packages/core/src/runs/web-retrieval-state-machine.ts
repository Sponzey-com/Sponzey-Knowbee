export type WebRetrievalState =
  | "DIAGNOSED"
  | "SEARCH_PLANNED"
  | "SEARCHING"
  | "CANDIDATES_READY"
  | "FETCH_PLANNED"
  | "FETCHING"
  | "EVIDENCE_READY"
  | "VERIFYING"
  | "REDIAGNOSING"
  | "COMPLETED"
  | "BLOCKED"
  | "CANCELLED"

export interface WebRetrievalMachine {
  state: WebRetrievalState
  attemptFingerprints: readonly string[]
  lastFailureReasonCode: string | null
}

export type WebRetrievalEvent =
  | { type: "search_planned"; attemptFingerprint: string }
  | { type: "search_started" }
  | { type: "search_succeeded" }
  | { type: "fetch_planned"; attemptFingerprint: string }
  | { type: "fetch_started" }
  | { type: "fetch_succeeded" }
  | { type: "verification_started" }
  | { type: "verification_completed" }
  | { type: "search_failed" | "fetch_failed" | "verification_failed"; reasonCode: string }
  | { type: "blocked"; reasonCode: string }
  | { type: "cancelled" }

export type WebRetrievalTransition =
  | { ok: true; value: WebRetrievalMachine }
  | {
      ok: false
      reasonCode:
        | "web_retrieval_transition_invalid"
        | "web_retrieval_attempt_duplicate"
        | "web_retrieval_terminal_state"
    }

export function createWebRetrievalMachine(): WebRetrievalMachine {
  return Object.freeze({
    state: "DIAGNOSED",
    attemptFingerprints: Object.freeze([]),
    lastFailureReasonCode: null,
  })
}

const TERMINAL = new Set<WebRetrievalState>(["COMPLETED", "BLOCKED", "CANCELLED"])

export function transitionWebRetrieval(
  machine: WebRetrievalMachine,
  event: WebRetrievalEvent,
): WebRetrievalTransition {
  if (TERMINAL.has(machine.state)) {
    return { ok: false, reasonCode: "web_retrieval_terminal_state" }
  }
  if (event.type === "cancelled") {
    return { ok: true, value: { ...machine, state: "CANCELLED" } }
  }
  if (event.type === "blocked") {
    return {
      ok: true,
      value: { ...machine, state: "BLOCKED", lastFailureReasonCode: event.reasonCode },
    }
  }
  if (event.type === "search_failed" || event.type === "fetch_failed" || event.type === "verification_failed") {
    return {
      ok: true,
      value: {
        ...machine,
        state: "REDIAGNOSING",
        lastFailureReasonCode: event.reasonCode,
      },
    }
  }
  if (event.type === "search_planned" || event.type === "fetch_planned") {
    if (machine.attemptFingerprints.includes(event.attemptFingerprint)) {
      return { ok: false, reasonCode: "web_retrieval_attempt_duplicate" }
    }
    const allowed = machine.state === "DIAGNOSED" || machine.state === "REDIAGNOSING" ||
      (
        event.type === "fetch_planned" &&
        (machine.state === "CANDIDATES_READY" || machine.state === "EVIDENCE_READY")
      )
    if (!allowed) return { ok: false, reasonCode: "web_retrieval_transition_invalid" }
    return {
      ok: true,
      value: {
        state: event.type === "search_planned" ? "SEARCH_PLANNED" : "FETCH_PLANNED",
        attemptFingerprints: Object.freeze([
          ...machine.attemptFingerprints,
          event.attemptFingerprint,
        ]),
        lastFailureReasonCode: machine.lastFailureReasonCode,
      },
    }
  }
  if (
    event.type === "verification_started" &&
    (machine.state === "CANDIDATES_READY" || machine.state === "EVIDENCE_READY")
  ) {
    return { ok: true, value: { ...machine, state: "VERIFYING" } }
  }
  const transitions: Partial<Record<WebRetrievalEvent["type"], readonly [WebRetrievalState, WebRetrievalState]>> = {
    search_started: ["SEARCH_PLANNED", "SEARCHING"],
    search_succeeded: ["SEARCHING", "CANDIDATES_READY"],
    fetch_started: ["FETCH_PLANNED", "FETCHING"],
    fetch_succeeded: ["FETCHING", "EVIDENCE_READY"],
    verification_completed: ["VERIFYING", "COMPLETED"],
  }
  const transition = transitions[event.type]
  if (!transition || machine.state !== transition[0]) {
    return { ok: false, reasonCode: "web_retrieval_transition_invalid" }
  }
  return { ok: true, value: { ...machine, state: transition[1] } }
}
