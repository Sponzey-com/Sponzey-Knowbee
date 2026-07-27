import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  evaluateUiInteractionRecovery,
  type UiInteractionRecoveryContract,
} from "../packages/webui/src/lib/user-first-ui-policy.ts"

const contract: UiInteractionRecoveryContract = {
  interactionId: "cancel-running-task",
  accessibleName: "Cancel running task",
  keyboardOperable: true,
  statusAnnouncement: "polite",
  mistakeRecovery: {
    kind: "confirmation",
    actionLabel: "Keep running",
    preservesInput: true,
  },
  destructive: true,
  failurePossible: true,
  failureReasonVisible: true,
  nextActionVisible: true,
}

describe("task1258 UI recovery and accessibility", () => {
  it("accepts an accessible destructive interaction with recovery and actionable failure", () => {
    expect(evaluateUiInteractionRecovery(contract)).toEqual({
      decision: "valid",
      reasonCodes: ["interaction_recovery_complete"],
    })
  })

  it("rejects missing accessible name, keyboard operation, and status announcement", () => {
    expect(evaluateUiInteractionRecovery({
      ...contract,
      accessibleName: "",
      keyboardOperable: false,
      statusAnnouncement: "none",
    })).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "accessible_name_missing",
        "keyboard_operation_missing",
        "status_announcement_missing",
      ]),
    })
  })

  it("rejects destructive work without undo, cancellation, or confirmation", () => {
    expect(evaluateUiInteractionRecovery({
      ...contract,
      mistakeRecovery: { kind: "none", preservesInput: false },
    })).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "destructive_recovery_missing",
        "recovery_action_missing",
      ]),
    })
  })

  it("requires preserved input and a correction action for input mistakes", () => {
    expect(evaluateUiInteractionRecovery({
      ...contract,
      destructive: false,
      mistakeRecovery: { kind: "correct_input", actionLabel: "", preservesInput: false },
    })).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "recovery_action_missing",
        "input_not_preserved_for_correction",
      ]),
    })
  })

  it("requires a visible reason and next action for possible failures", () => {
    expect(evaluateUiInteractionRecovery({
      ...contract,
      failureReasonVisible: false,
      nextActionVisible: false,
    })).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "failure_reason_missing",
        "failure_next_action_missing",
      ]),
    })
  })

  it("keeps execution cancellation behind an explicit confirmation state", () => {
    const source = readFileSync(new URL("../packages/webui/src/components/runs/CancelRunButton.tsx", import.meta.url), "utf8")
    expect(source).toContain('useState(false)')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('text("계속 실행", "Keep running")')
    expect(source).toContain('text("취소 확인", "Confirm cancellation")')
    expect(source).not.toContain('onClick={(event) => {\n        event.stopPropagation()\n        onCancel()')
  })
})
