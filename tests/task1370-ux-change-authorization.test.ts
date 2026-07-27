import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  UX_CHANGE_INTENTS,
  UX_RECOVERY_CAPABILITIES,
  authorizeUxChange,
  publishAuthorizedUxChange,
  type UxCommonFlowReceipt,
  type UxRecoveryReceipt,
  type UxUserValueReceipt,
} from "../packages/core/src/contracts/ux-change-authorization.ts"

function value(overrides: Partial<UxUserValueReceipt> = {}): UxUserValueReceipt {
  return {
    changeId: "change:setup-save",
    intent: "user_task",
    userTaskId: "task:configure-agent",
    metricId: "successful-completion-rate",
    improvementDirection: "higher",
    baselineValue: 70,
    projectedValue: 85,
    evidenceRef: "ux:value:1370",
    ...overrides,
  }
}

function flow(overrides: Partial<UxCommonFlowReceipt> = {}): UxCommonFlowReceipt {
  return {
    flowId: "flow:configure-agent",
    frequencyEvidenceRef: "analytics:common-flow",
    beforeStepCount: 5,
    afterStepCount: 3,
    stateNames: ["editing", "validating", "saved"],
    deterministicForSameInput: true,
    evidenceRef: "ux:flow:1370",
    ...overrides,
  }
}

function recovery(overrides: Partial<UxRecoveryReceipt> = {}): UxRecoveryReceipt {
  return {
    flowId: "flow:configure-agent",
    destructive: false,
    capabilities: UX_RECOVERY_CAPABILITIES.map((capability) => ({
      capability,
      status: "provided",
      evidenceRef: `ux:recovery:${capability}`,
    })),
    ...overrides,
  }
}

function decision(overrides: Partial<Parameters<typeof authorizeUxChange>[0]> = {}) {
  return authorizeUxChange({ value: value(), flow: flow(), recovery: recovery(), ...overrides })
}

describe("task1370 UX change authorization", () => {
  it("publishes a user-task change with improved outcome, shorter flow, clear states, and complete recovery", async () => {
    const publish = vi.fn(async () => "released")
    await expect(publishAuthorizedUxChange({ decision: decision(), publish })).resolves.toEqual({ status: "published", result: "released" })
    expect(publish).toHaveBeenCalledOnce()
  })

  it.each(UX_CHANGE_INTENTS.filter((intent) => intent !== "user_task"))("blocks %s as a primary UI change intent", async (intent) => {
    const publish = vi.fn()
    const denied = decision({ value: value({ intent }) })
    expect(denied).toEqual({ status: "blocked", reasonCode: "non_user_intent" })
    await publishAuthorizedUxChange({ decision: denied, publish })
    expect(publish).not.toHaveBeenCalled()
  })

  it("requires a measured user outcome improvement in the declared direction", () => {
    expect(decision({ value: value({ projectedValue: 70 }) })).toEqual({ status: "blocked", reasonCode: "user_outcome_not_improved" })
    expect(decision({ value: value({ improvementDirection: "lower", projectedValue: 80 }) })).toEqual({ status: "blocked", reasonCode: "user_outcome_not_improved" })
  })

  it("allows fewer or equal common-flow steps when states remain explicit and deterministic", () => {
    expect(decision({ flow: flow({ afterStepCount: 3 }) })).toMatchObject({ status: "authorized" })
    expect(decision({ flow: flow({ afterStepCount: 5 }) })).toMatchObject({ status: "authorized" })
  })

  it("blocks increased steps, duplicate states, empty states, and nondeterministic outcomes", () => {
    expect(decision({ flow: flow({ afterStepCount: 6 }) })).toEqual({ status: "blocked", reasonCode: "common_flow_regressed" })
    expect(decision({ flow: flow({ stateNames: ["editing", "editing"] }) })).toEqual({ status: "blocked", reasonCode: "common_flow_state_ambiguous" })
    expect(decision({ flow: flow({ stateNames: [""] }) })).toEqual({ status: "blocked", reasonCode: "common_flow_state_ambiguous" })
    expect(decision({ flow: flow({ deterministicForSameInput: false }) })).toEqual({ status: "blocked", reasonCode: "common_flow_state_ambiguous" })
  })

  it.each(UX_RECOVERY_CAPABILITIES)("requires recovery capability %s or a justified provided alternative", (capability) => {
    expect(decision({ recovery: recovery({ capabilities: recovery().capabilities.filter((item) => item.capability !== capability) }) }))
      .toEqual({ status: "blocked", reasonCode: "recovery_capability_missing", capability })
    expect(decision({ recovery: recovery({ capabilities: recovery().capabilities.map((item) => item.capability === capability
      ? { ...item, status: "not_applicable", exceptionReason: "Not available in this flow.", alternativeCapability: "input_recovery" }
      : item) }) })).toMatchObject({ status: capability === "input_recovery" ? "blocked" : "authorized" })
  })

  it("requires cancel or undo for destructive flows", () => {
    const capabilities = recovery().capabilities.map((item) => item.capability === "cancel"
      ? { ...item, status: "not_applicable" as const, exceptionReason: "Undo replaces cancel.", alternativeCapability: "undo" as const }
      : item.capability === "undo"
        ? { ...item, status: "not_applicable" as const, exceptionReason: "Cancel replaces undo.", alternativeCapability: "cancel" as const }
        : item)
    expect(decision({ recovery: recovery({ destructive: true, capabilities }) })).toMatchObject({ status: "blocked" })
  })

  it("uses only injected UX verification receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/ux-change-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/document\.|window\.|process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
