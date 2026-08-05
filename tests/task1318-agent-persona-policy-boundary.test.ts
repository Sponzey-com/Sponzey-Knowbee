import { describe, expect, it } from "vitest"
import {
  AGENT_PERSONA_PROTECTED_POLICY_AXES,
  evaluateAgentPersonaPolicyBoundary,
} from "../packages/core/src/contracts/agent-persona-policy-boundary.ts"

describe("task1318 agent persona policy boundary", () => {
  it("applies explicit tone and style traits without policy overrides", () => {
    expect(evaluateAgentPersonaPolicyBoundary({
      explicitTraits: ["concise", "formal", "concise"],
      overrideAttempts: [],
    })).toEqual({ status: "applied", traits: ["concise", "formal"] })
  })

  it("keeps persona inactive when explicit traits are absent", () => {
    expect(evaluateAgentPersonaPolicyBoundary({ explicitTraits: ["  "], overrideAttempts: [] }))
      .toEqual({ status: "inactive", reasonCode: "explicit_traits_missing" })
  })

  it.each(AGENT_PERSONA_PROTECTED_POLICY_AXES)("blocks persona override of %s", (axis) => {
    expect(evaluateAgentPersonaPolicyBoundary({
      explicitTraits: ["casual"],
      overrideAttempts: [{ axis, instruction: `Override ${axis}.` }],
    })).toEqual({
      status: "blocked",
      reasonCode: "persona_policy_override",
      blockedAxes: [axis],
    })
  })
})
