import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS,
  CANONICAL_RECURSIVE_IMPROVEMENT_STATES,
  CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS,
  authorizeRecursiveImprovementTransition,
  type RecursiveImprovementTransitionInput,
} from "../packages/core/src/contracts/recursive-improvement-state-machine.ts"

const proposal = "proposal:state:1394"
const sourceSet = "sources:state:1394"
const sourceRefs = ["prompt:identity"]

function input(overrides: Partial<RecursiveImprovementTransitionInput> = {}): RecursiveImprovementTransitionInput {
  return {
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    currentState: "idle",
    event: "start_requested",
    requestedNextState: "intake",
    sourceWrite: { state: "unchanged", sourceRefs },
    ...overrides,
  }
}

const expectedStates = [
  "idle", "intake", "source_discovery", "baseline_capture", "proposal_drafting",
  "harness_meta_review", "invariant_review", "diff_generation", "approval_wait",
  "apply_change", "test_execution", "activation_pending", "activated", "reporting",
  "completed", "blocked", "rolled_back",
]

const expectedEvents = [
  "start_requested", "inputs_validated", "source_found", "source_missing", "baseline_recorded",
  "proposal_ready", "harness_change_requested", "harness_guardrails_passed", "harness_guardrails_failed",
  "invariant_passed", "invariant_failed", "diff_ready", "approval_granted", "approval_denied",
  "change_applied", "tests_passed", "tests_failed", "activation_confirmed", "rollback_requested",
  "rollback_completed", "max_retry_reached", "cancel_requested",
]

describe("task1394 canonical recursive-improvement state machine", () => {
  it("owns the exact GOAL 9.7 state and event inventories", () => {
    expect(CANONICAL_RECURSIVE_IMPROVEMENT_STATES).toEqual(expectedStates)
    expect(CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS).toEqual(expectedEvents)
    expect(CANONICAL_RECURSIVE_IMPROVEMENT_EVENTS).not.toContain("recovery_stop_required")
  })

  it("authorizes every ordinary canonical transition with its exact event", () => {
    for (const transition of CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS.filter((item) => !["blocked", "rolled_back", "completed"].includes(item.to) && item.event !== "tests_failed")) {
      expect(authorizeRecursiveImprovementTransition(input({
        currentState: transition.from,
        event: transition.event,
        requestedNextState: transition.to,
        sourceWrite: { state: transition.from === "apply_change" || transition.from === "test_execution" || transition.from === "activation_pending" || transition.from === "activated" || transition.from === "reporting" ? "written" : "unchanged", sourceRefs },
      })), `${transition.from}/${transition.event ?? "automatic"}/${transition.to}`).toMatchObject({ status: "authorized", nextState: transition.to })
    }
  })

  it("rejects the right state pair with a wrong event and the right event with a wrong target", () => {
    expect(authorizeRecursiveImprovementTransition(input({ event: "inputs_validated" })))
      .toEqual({ status: "blocked", reasonCode: "transition_not_allowed" })
    expect(authorizeRecursiveImprovementTransition(input({ requestedNextState: "apply_change" })))
      .toEqual({ status: "blocked", reasonCode: "transition_not_allowed" })
  })

  it("rejects unknown states, events, duplicate transition definitions, and terminal exits", () => {
    expect(authorizeRecursiveImprovementTransition(input({ currentState: "unknown" as never })))
      .toEqual({ status: "blocked", reasonCode: "state_invalid" })
    expect(authorizeRecursiveImprovementTransition(input({ event: "unknown" as never })))
      .toEqual({ status: "blocked", reasonCode: "event_invalid" })
    expect(new Set(CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS.map((item) => `${item.from}:${item.event ?? "automatic"}`)).size)
      .toBe(CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS.length)
    for (const currentState of ["completed", "blocked", "rolled_back"] as const) {
      expect(authorizeRecursiveImprovementTransition(input({ currentState, event: "start_requested", requestedNextState: "intake" })))
        .toEqual({ status: "blocked", reasonCode: "terminal_state_exit_forbidden" })
    }
  })

  it.each([
    ["source_discovery", "source_missing"],
    ["harness_meta_review", "harness_guardrails_failed"],
    ["invariant_review", "invariant_failed"],
    ["approval_wait", "approval_denied"],
  ] as const)("requires structured blocked evidence for %s / %s", (currentState, event) => {
    const base = { currentState, event, requestedNextState: "blocked" as const }
    expect(authorizeRecursiveImprovementTransition(input(base)))
      .toEqual({ status: "blocked", reasonCode: "blocked_evidence_missing" })
    expect(authorizeRecursiveImprovementTransition(input({ ...base, blockedEvidence: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, reason: "required_evidence_missing", evidenceRef: "evidence:blocked:1394" } })))
      .toMatchObject({ status: "authorized", nextState: "blocked", terminal: true })
  })

  it("routes tests_failed only through an evidenced changed-strategy retry", () => {
    const base = { currentState: "test_execution" as const, event: "tests_failed" as const, requestedNextState: "proposal_drafting" as const, sourceWrite: { state: "written" as const, sourceRefs } }
    expect(authorizeRecursiveImprovementTransition(input(base)))
      .toEqual({ status: "blocked", reasonCode: "retry_evidence_missing" })
    expect(authorizeRecursiveImprovementTransition(input({ ...base, retryEvidence: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, changedAxes: ["verification_method"], evidenceRef: "evidence:retry:1394" } })))
      .toMatchObject({ status: "authorized", nextState: "proposal_drafting" })
  })

  it("does not make retry count alone terminal", () => {
    expect(authorizeRecursiveImprovementTransition(input({
      currentState: "test_execution", event: "max_retry_reached", requestedNextState: "rolled_back",
      sourceWrite: { state: "written", sourceRefs },
    }))).toEqual({ status: "blocked", reasonCode: "blocked_evidence_missing" })
    expect(authorizeRecursiveImprovementTransition(input({
      currentState: "test_execution", event: "max_retry_reached", requestedNextState: "rolled_back",
      sourceWrite: { state: "written", sourceRefs },
      blockedEvidence: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, reason: "safe_changed_strategies_exhausted", evidenceRef: "evidence:stop:1394" },
    }))).toEqual({ status: "rollback_required", reasonCode: "terminal_stop_after_write", sourceRefs })
  })

  it("keeps rollback_requested non-terminal until verified rollback_completed", () => {
    const requested = authorizeRecursiveImprovementTransition(input({ currentState: "activation_pending", event: "rollback_requested", requestedNextState: "rolled_back", sourceWrite: { state: "written", sourceRefs } }))
    expect(requested).toEqual({ status: "rollback_required", reasonCode: "rollback_requested", sourceRefs })
    const completed = authorizeRecursiveImprovementTransition(input({
      currentState: "activation_pending", event: "rollback_completed", requestedNextState: "rolled_back", sourceWrite: { state: "written", sourceRefs },
      rollbackEvidence: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, restoredSourceRefs: sourceRefs, baselineRestored: true, verificationRef: "evidence:rollback:1394" },
    }))
    expect(completed).toMatchObject({ status: "authorized", nextState: "rolled_back", terminal: true })
  })

  it("routes cancel to blocked before write and rollback after write", () => {
    expect(authorizeRecursiveImprovementTransition(input({
      currentState: "proposal_drafting", event: "cancel_requested", requestedNextState: "blocked",
      blockedEvidence: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, reason: "user_cancelled", evidenceRef: "evidence:cancel:1394" },
    }))).toMatchObject({ status: "authorized", nextState: "blocked" })
    expect(authorizeRecursiveImprovementTransition(input({ currentState: "test_execution", event: "cancel_requested", requestedNextState: "blocked", sourceWrite: { state: "written", sourceRefs } })))
      .toEqual({ status: "rollback_required", reasonCode: "cancel_after_write", sourceRefs })
  })

  it("requires complete source, validation, activation, rollback, and report evidence for completed", () => {
    const base = { currentState: "reporting" as const, event: null, requestedNextState: "completed" as const, sourceWrite: { state: "written" as const, sourceRefs } }
    expect(authorizeRecursiveImprovementTransition(input(base)))
      .toEqual({ status: "blocked", reasonCode: "completion_evidence_missing" })
    expect(authorizeRecursiveImprovementTransition(input({ ...base, completionEvidence: {
      proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, changedSourceRefs: sourceRefs,
      sourceWriteVerified: true, validationEvidenceRefs: ["test:regression:1394"], activationState: "activated",
      activationEvidenceRef: "activation:1394", rollbackPath: "git:baseline:1394", finalReportRef: "report:1394",
    } }))).toMatchObject({ status: "authorized", nextState: "completed", terminal: true })
  })

  it("rejects cross-proposal terminal evidence", () => {
    expect(authorizeRecursiveImprovementTransition(input({
      currentState: "activation_pending", event: "rollback_completed", requestedNextState: "rolled_back", sourceWrite: { state: "written", sourceRefs },
      rollbackEvidence: { proposalFingerprint: "proposal:other", sourceSetFingerprint: sourceSet, restoredSourceRefs: sourceRefs, baselineRestored: true, verificationRef: "rollback:1394" },
    }))).toEqual({ status: "blocked", reasonCode: "rollback_evidence_invalid" })
  })

  it("keeps source and prompt event inventories aligned with GOAL", () => {
    const harness = readFileSync(new URL("../packages/core/src/memory/prompt-improvement-harness.ts", import.meta.url), "utf8")
    const canonical = readFileSync(new URL("../packages/core/src/contracts/recursive-improvement-state-machine.ts", import.meta.url), "utf8")
    const prompt = readFileSync(new URL("../prompts/prompt_improvement.md", import.meta.url), "utf8")
    expect(harness).toContain("CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS")
    expect(canonical).toContain("max_retry_reached")
    expect(prompt).toContain("`max_retry_reached`")
    expect(canonical).not.toContain("recovery_stop_required")
    expect(prompt).not.toContain("recovery_stop_required")
  })

  it("uses no file, environment, network, clock, or mutable global access", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/recursive-improvement-state-machine.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
