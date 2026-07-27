import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES,
  applyPromptImprovementWithPrerequisites,
  authorizePromptImprovementApplyPrerequisites,
  classifyPromptImprovementRisk,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

function authorize(overrides: Partial<Parameters<typeof authorizePromptImprovementApplyPrerequisites>[0]> = {}) {
  return authorizePromptImprovementApplyPrerequisites({
    risk: "low",
    tests: ["tests/prompt-source-regression.test.ts"],
    rollbackTarget: "prompt-version:v1",
    rollbackVerified: true,
    approvalMode: "none",
    approvalGranted: false,
    ...overrides,
  })
}

describe("task1306 prompt risk apply prerequisites", () => {
  const rollbackReadiness = {
    status: "authorized" as const,
    sourceType: "source_control_revision" as const,
    sourceRef: "git:abc1234",
    targetSourceRef: "prompt:final_response",
    baselineVersion: "v1",
    baselineChecksum: "sha:v1",
    executorId: "rollback-adapter:git",
    verificationMethod: "checksum_compare" as const,
    evidenceRef: "rollback-ready:1306",
  }

  it.each(PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES)("classifies protected impact %s as high", (axis) => {
    expect(classifyPromptImprovementRisk({
      changeKind: "wording_clarification",
      impactAxes: [axis],
    })).toBe("high")
  })

  it("allows low risk without approval only with tests and a verified rollback target", () => {
    expect(authorize()).toEqual({
      status: "authorized",
      risk: "low",
      tests: ["tests/prompt-source-regression.test.ts"],
      rollbackTarget: "prompt-version:v1",
      approvalMode: "none",
    })
  })

  it.each([
    [{ tests: [] }, "apply_tests_missing"],
    [{ rollbackTarget: "" }, "apply_rollback_target_missing"],
    [{ rollbackVerified: false }, "apply_rollback_unverified"],
  ] as const)("blocks low risk with incomplete prerequisite %o", (change, reasonCode) => {
    expect(authorize(change)).toEqual({ status: "blocked", reasonCode })
  })

  it("requires explicit user or stronger approval before medium risk apply", () => {
    expect(authorize({ risk: "medium" })).toEqual({ status: "blocked", reasonCode: "apply_approval_missing" })
    expect(authorize({ risk: "medium", approvalMode: "user_required", approvalGranted: true })).toMatchObject({
      status: "authorized", risk: "medium",
    })
  })

  it("requires admin approval mode before high risk apply", () => {
    expect(authorize({ risk: "high" })).toEqual({ status: "blocked", reasonCode: "apply_approval_mode_invalid" })
    expect(authorize({ risk: "high", approvalMode: "user_required", approvalGranted: true }))
      .toEqual({ status: "blocked", reasonCode: "apply_approval_mode_invalid" })
    expect(authorize({ risk: "high", approvalMode: "admin_required", approvalGranted: true })).toMatchObject({
      status: "authorized", risk: "high",
    })
  })

  it("never applies a blocked prerequisite decision", async () => {
    const apply = vi.fn(async () => "written")
    await expect(applyPromptImprovementWithPrerequisites({
      decision: authorize({ tests: [] }),
      rollbackReadiness,
      apply,
    })).resolves.toEqual({ status: "blocked", reasonCode: "apply_tests_missing" })
    expect(apply).not.toHaveBeenCalled()

    await expect(applyPromptImprovementWithPrerequisites({
      decision: authorize(),
      rollbackReadiness,
      apply,
    })).resolves.toEqual({ status: "applied", result: "written" })
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
