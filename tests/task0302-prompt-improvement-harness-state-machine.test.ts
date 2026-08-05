import { describe, expect, it } from "vitest"
import {
  canTransitionPromptImprovementHarnessState,
  validatePromptImprovementHarnessStateTransition,
  type PromptImprovementHarnessEvent,
  type PromptImprovementHarnessState,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const REQUIRED_TRANSITIONS: Array<[PromptImprovementHarnessState, PromptImprovementHarnessState]> = [
  ["idle", "intake"],
  ["intake", "source_discovery"],
  ["intake", "blocked"],
  ["source_discovery", "baseline_capture"],
  ["source_discovery", "blocked"],
  ["baseline_capture", "proposal_drafting"],
  ["proposal_drafting", "invariant_review"],
  ["proposal_drafting", "harness_meta_review"],
  ["harness_meta_review", "invariant_review"],
  ["harness_meta_review", "blocked"],
  ["invariant_review", "diff_generation"],
  ["invariant_review", "blocked"],
  ["diff_generation", "approval_wait"],
  ["approval_wait", "apply_change"],
  ["approval_wait", "blocked"],
  ["apply_change", "test_execution"],
  ["test_execution", "activation_pending"],
  ["test_execution", "proposal_drafting"],
  ["test_execution", "rolled_back"],
  ["activation_pending", "activated"],
  ["activated", "reporting"],
  ["reporting", "completed"],
]

const REQUIRED_EVENTS: PromptImprovementHarnessEvent[] = [
  "start_requested",
  "inputs_validated",
  "source_found",
  "source_missing",
  "baseline_recorded",
  "proposal_ready",
  "harness_change_requested",
  "harness_guardrails_passed",
  "harness_guardrails_failed",
  "invariant_passed",
  "invariant_failed",
  "diff_ready",
  "approval_granted",
  "approval_denied",
  "change_applied",
  "tests_passed",
  "tests_failed",
  "activation_confirmed",
  "rollback_requested",
  "rollback_completed",
  "max_retry_reached",
  "cancel_requested",
]

describe("task0302 prompt improvement harness state machine", () => {
  it("allows the GOAL recursive improvement state transitions", () => {
    for (const [from, to] of REQUIRED_TRANSITIONS) {
      const context = to === "blocked"
        ? { sourceWriteState: "unchanged" as const, blockedEvidence: "safe_changed_strategies_exhausted" as const }
        : to === "rolled_back"
          ? { sourceWriteState: "written" as const }
          : undefined
      expect(canTransitionPromptImprovementHarnessState(from, to, undefined, context), `${from} -> ${to}`).toBe(true)
    }
  })

  it("supports rollback and cancel events without opening terminal states", () => {
    expect(REQUIRED_EVENTS).toContain("rollback_requested")
    const written = { sourceWriteState: "written" as const }
    const unchanged = { sourceWriteState: "unchanged" as const, blockedEvidence: "user_limit_reached" as const }
    expect(canTransitionPromptImprovementHarnessState("apply_change", "rolled_back", "rollback_requested", written)).toBe(false)
    expect(canTransitionPromptImprovementHarnessState("activation_pending", "rolled_back", "rollback_requested", written)).toBe(false)
    expect(canTransitionPromptImprovementHarnessState("activated", "rolled_back", "rollback_requested", written)).toBe(false)
    expect(canTransitionPromptImprovementHarnessState("proposal_drafting", "blocked", "cancel_requested", unchanged)).toBe(true)
    expect(canTransitionPromptImprovementHarnessState("completed", "blocked", "cancel_requested")).toBe(false)
    expect(canTransitionPromptImprovementHarnessState("blocked", "intake")).toBe(false)
  })

  it("rejects impossible direct activation and completion transitions", () => {
    expect(validatePromptImprovementHarnessStateTransition("idle", "apply_change")).toEqual([
      expect.objectContaining({ code: "invalid_state_transition", path: "state" }),
    ])
    expect(validatePromptImprovementHarnessStateTransition("proposal_drafting", "activated")).toEqual([
      expect.objectContaining({ code: "invalid_state_transition", path: "state" }),
    ])
    expect(validatePromptImprovementHarnessStateTransition("test_execution", "completed")).toEqual([
      expect.objectContaining({ code: "invalid_state_transition", path: "state" }),
    ])
  })
})
