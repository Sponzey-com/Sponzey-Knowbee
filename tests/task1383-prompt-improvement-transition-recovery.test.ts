import { describe, expect, it } from "vitest"
import {
  PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS,
  PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES,
  canTransitionPromptImprovementHarnessState,
  changedPromptImprovementRecoveryAxes,
  decidePromptImprovementInterrupt,
  decidePromptImprovementRecovery,
  type PromptImprovementHarnessState,
  type PromptImprovementRecoveryChangeAxis,
  type PromptImprovementRecoveryStrategy,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const STATES = Object.keys(PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS) as PromptImprovementHarnessState[]

function strategy(overrides: Partial<PromptImprovementRecoveryStrategy> = {}): PromptImprovementRecoveryStrategy {
  return {
    targetRef: "prompt:identity",
    inputFingerprint: "input:v1",
    toolIds: ["tool:a"],
    workSplitFingerprint: "split:v1",
    executionOrderFingerprint: "order:v1",
    verificationMethod: "test:a",
    ...overrides,
  }
}

const AXIS_CHANGES: Record<PromptImprovementRecoveryChangeAxis, Partial<PromptImprovementRecoveryStrategy>> = {
  target: { targetRef: "prompt:workflow" },
  input: { inputFingerprint: "input:v2" },
  tool: { toolIds: ["tool:b"] },
  work_split: { workSplitFingerprint: "split:v2" },
  execution_order: { executionOrderFingerprint: "order:v2" },
  verification_method: { verificationMethod: "test:b" },
}

describe("task1383 prompt improvement transition and recovery policy", () => {
  it("keeps the GOAL transition table closed and rejects every unlisted state pair", () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const listed = PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS[from].includes(to)
        const context = to === "blocked"
          ? { sourceWriteState: "unchanged" as const, blockedEvidence: "safe_changed_strategies_exhausted" as const }
          : to === "rolled_back"
            ? { sourceWriteState: "written" as const }
            : undefined

        expect(
          canTransitionPromptImprovementHarnessState(from, to, undefined, context),
          `${from} -> ${to}`,
        ).toBe(listed)
      }
    }
  })

  it.each(PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES)(
    "authorizes proposal revision after changing the %s axis",
    (axis) => {
      const previous = strategy()
      const next = strategy(AXIS_CHANGES[axis])

      expect(changedPromptImprovementRecoveryAxes({ previous, next })).toEqual([axis])
      expect(decidePromptImprovementRecovery({
        retryCount: 10_000,
        sourceWriteState: "unchanged",
        previousStrategy: previous,
        nextStrategy: next,
      })).toEqual({
        status: "proposal_revision_authorized",
        nextState: "proposal_drafting",
        changedAxes: [axis],
        retryCount: 10_000,
      })
    },
  )

  it("never treats retry count alone as a terminal condition", () => {
    for (const retryCount of [0, 1, 3, 100, Number.MAX_SAFE_INTEGER]) {
      expect(decidePromptImprovementRecovery({
        retryCount,
        sourceWriteState: "unchanged",
        previousStrategy: strategy(),
        nextStrategy: strategy(),
      })).toEqual({
        status: "strategy_change_required",
        nextState: "test_execution",
        reasonCode: "same_strategy",
        retryCount,
      })
    }
  })

  it.each([
    "user_limit_reached",
    "safety_boundary_reached",
    "safe_changed_strategies_exhausted",
  ] as const)("allows blocked only from explicit terminal evidence: %s", (blockedEvidence) => {
    expect(decidePromptImprovementRecovery({
      retryCount: 1,
      sourceWriteState: "unchanged",
      blockedEvidence,
    })).toEqual({ status: "blocked", nextState: "blocked", reasonCode: blockedEvidence, retryCount: 1 })

    expect(decidePromptImprovementRecovery({
      retryCount: 1,
      sourceWriteState: "written",
      blockedEvidence,
    })).toEqual({ status: "rollback_required", nextState: "rolled_back", reasonCode: blockedEvidence, retryCount: 1 })
  })

  it("routes rollback and cancel by state and source-write evidence", () => {
    expect(decidePromptImprovementInterrupt({
      state: "test_execution",
      event: "rollback_requested",
      sourceWriteState: "written",
    })).toEqual({ status: "rollback_required", nextState: "rolled_back", reasonCode: "rollback_requested" })

    expect(decidePromptImprovementInterrupt({
      state: "proposal_drafting",
      event: "cancel_requested",
      sourceWriteState: "unchanged",
      blockedEvidence: "user_limit_reached",
    })).toEqual({ status: "transition_authorized", nextState: "blocked" })

    expect(decidePromptImprovementInterrupt({
      state: "activation_pending",
      event: "cancel_requested",
      sourceWriteState: "written",
    })).toEqual({ status: "rollback_required", nextState: "rolled_back", reasonCode: "cancel_after_source_write" })
  })

  it("rejects missing strategy, unsupported interrupts, and evidence-free blocked transitions", () => {
    expect(decidePromptImprovementRecovery({ retryCount: 4, sourceWriteState: "unchanged" }))
      .toMatchObject({ status: "strategy_change_required", reasonCode: "strategy_missing" })
    expect(decidePromptImprovementInterrupt({
      state: "proposal_drafting",
      event: "rollback_requested",
      sourceWriteState: "unchanged",
    })).toEqual({ status: "blocked", reasonCode: "rollback_source_not_written" })
    expect(decidePromptImprovementInterrupt({
      state: "completed",
      event: "cancel_requested",
      sourceWriteState: "unchanged",
    })).toEqual({ status: "blocked", reasonCode: "interrupt_not_allowed" })
    expect(decidePromptImprovementInterrupt({
      state: "proposal_drafting",
      event: "cancel_requested",
      sourceWriteState: "unchanged",
    })).toEqual({ status: "blocked", reasonCode: "blocked_evidence_missing" })
    expect(canTransitionPromptImprovementHarnessState(
      "invariant_review",
      "blocked",
      undefined,
      { sourceWriteState: "unchanged" },
    )).toBe(false)
  })
})
