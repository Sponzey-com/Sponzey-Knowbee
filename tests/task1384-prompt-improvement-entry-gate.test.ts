import { describe, expect, it, vi } from "vitest"
import {
  authorizePromptImprovementEntry,
  enterAuthorizedPromptImprovement,
  type PromptImprovementEntryReceipt,
  type PromptImprovementEntryTriggerKind,
} from "../packages/core/src/contracts/recursive-prompt-improvement-gate.ts"

const now = Date.UTC(2026, 6, 15, 12)

function receipt(
  triggerKind: PromptImprovementEntryTriggerKind,
  overrides: Partial<PromptImprovementEntryReceipt> = {},
): PromptImprovementEntryReceipt {
  const actorType = triggerKind === "administrator_prompt_maintenance"
    ? "administrator"
    : triggerKind === "user_harness_change"
      ? "user"
      : "system"
  return {
    schemaVersion: 1,
    requestId: `request:${triggerKind}:1384`,
    actorId: `${actorType}:owner`,
    actorType,
    classifiedBy: "llm",
    diagnosisReceiptId: `diagnosis:${triggerKind}:1384`,
    triggerKind,
    diagnosedAction: "enter_prompt_improvement",
    explicitRequest: triggerKind === "user_harness_change" || triggerKind === "administrator_prompt_maintenance",
    targetSourceRefs: triggerKind === "user_harness_change"
      ? ["packages/core/src/memory/prompt-improvement-harness.ts#state-machine"]
      : ["prompt:prompt_improvement"],
    evidenceRefs: [`evidence:${triggerKind}:1384`],
    diagnosedAt: now - 100,
    expiresAt: now + 100,
    ...overrides,
  }
}

const ALLOWED = [
  "user_harness_change",
  "administrator_prompt_maintenance",
  "regression_or_validation_failure",
  "safety_vulnerability",
  "goal_behavior_mismatch",
] as const

const REJECTED = [
  ["casual_chat", "ordinary_request", "continue_ordinary_request"],
  ["ordinary_task", "ordinary_request", "continue_ordinary_request"],
  ["ambiguous_improvement", "needs_clarification", "ask_explicit_prompt_change_confirmation"],
  ["protected_boundary_bypass", "protected_boundary_bypass", "report_protected_boundary"],
  ["target_source_missing", "target_source_missing", "repair_entry_evidence"],
  ["invariant_weakening", "invariant_weakening", "report_protected_boundary"],
  ["runtime_environment_mutation", "runtime_environment_mutation", "report_protected_boundary"],
  ["hidden_instruction_mutation", "hidden_instruction_mutation", "report_protected_boundary"],
] as const

describe("task1384 prompt improvement harness entry gate", () => {
  it.each(ALLOWED)("enters intake from evidence-backed trigger %s", async (triggerKind) => {
    const decision = authorizePromptImprovementEntry({ receipt: receipt(triggerKind), now })
    const enter = vi.fn(async () => "entered")

    expect(decision).toMatchObject({
      status: "authorized",
      state: "intake",
      triggerKind,
      targetSourceRefs: expect.any(Array),
      evidenceRefs: expect.any(Array),
    })
    await expect(enterAuthorizedPromptImprovement({ decision, enter }))
      .resolves.toEqual({ status: "entered", result: "entered" })
    expect(enter).toHaveBeenCalledTimes(1)
  })

  it.each(REJECTED)(
    "blocks rejected trigger %s with %s",
    async (triggerKind, reasonCode, nextAction) => {
      const decision = authorizePromptImprovementEntry({
        receipt: receipt(triggerKind, {
          diagnosedAction: triggerKind === "ambiguous_improvement" ? "ask_clarification" : "stop_blocked",
          explicitRequest: false,
        }),
        now,
      })
      const enter = vi.fn()

      expect(decision).toEqual({ status: "blocked", state: "blocked", reasonCode, nextAction })
      await enterAuthorizedPromptImprovement({ decision, enter })
      expect(enter).not.toHaveBeenCalled()
    },
  )

  it("requires a fresh explicit user or administrator request", () => {
    expect(authorizePromptImprovementEntry({
      receipt: receipt("user_harness_change", { explicitRequest: false }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "explicit_confirmation_required" })
    expect(authorizePromptImprovementEntry({
      receipt: receipt("administrator_prompt_maintenance", { explicitRequest: false }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "explicit_confirmation_required" })
    expect(authorizePromptImprovementEntry({
      receipt: receipt("user_harness_change", { expiresAt: now }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "entry_receipt_expired" })
  })

  it("requires LLM diagnosis, matching actor, exact target, and trigger evidence", () => {
    expect(authorizePromptImprovementEntry({
      receipt: { ...receipt("user_harness_change"), classifiedBy: "rules" } as unknown as PromptImprovementEntryReceipt,
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "llm_diagnosis_required" })
    expect(authorizePromptImprovementEntry({
      receipt: receipt("user_harness_change", { actorType: "system" }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "actor_not_authorized" })
    expect(authorizePromptImprovementEntry({
      receipt: receipt("regression_or_validation_failure", { targetSourceRefs: ["prompts/*"] }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "target_source_required" })
    expect(authorizePromptImprovementEntry({
      receipt: receipt("safety_vulnerability", { evidenceRefs: [] }),
      now,
    })).toMatchObject({ status: "blocked", reasonCode: "trigger_evidence_required" })
  })

  it("does not reuse an ambiguous receipt as explicit confirmation", async () => {
    const ambiguous = authorizePromptImprovementEntry({ receipt: receipt("ambiguous_improvement", {
      diagnosedAction: "ask_clarification",
      explicitRequest: false,
    }), now })
    const enter = vi.fn()

    expect(ambiguous).toMatchObject({ status: "blocked", reasonCode: "needs_clarification" })
    await enterAuthorizedPromptImprovement({ decision: ambiguous, enter })
    expect(enter).not.toHaveBeenCalled()
  })
})
