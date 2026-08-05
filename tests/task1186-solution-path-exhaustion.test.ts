import { describe, expect, it } from "vitest"
import {
  assessSolutionPathExhaustion,
  type SolutionPathReview,
} from "../packages/core/src/index.ts"

const completeReviews: SolutionPathReview[] = [
  { path: "direct_answer", disposition: "reviewed_unavailable", reasonCode: "requires_external_action" },
  { path: "plan", disposition: "attempted", reasonCode: "plan_did_not_complete_goal" },
  { path: "tool", disposition: "attempted", reasonCode: "tool_failed" },
  { path: "sub_agent", disposition: "reviewed_unavailable", reasonCode: "no_capable_agent" },
  { path: "yeonjang", disposition: "reviewed_unavailable", reasonCode: "not_connected" },
  { path: "ask_clarification", disposition: "reviewed_unavailable", reasonCode: "no_missing_input" },
  {
    path: "partial_completion",
    disposition: "completed_partial",
    reasonCode: "local_plan_completed",
    resultRefs: ["output:local-plan"],
  },
  {
    path: "workaround_guidance",
    disposition: "guidance_ready",
    reasonCode: "manual_step_available",
    guidance: "Connect Yeonjang and retry the computer-control step.",
  },
]

describe("task1186 explicit solution-path exhaustion", () => {
  it("blocks a final failure while any required solution path has no review", () => {
    const result = assessSolutionPathExhaustion(completeReviews.filter((review) => review.path !== "yeonjang"))

    expect(result.complete).toBe(false)
    expect(result.canFinalizeFailure).toBe(false)
    expect(result.missingPaths).toEqual(["yeonjang"])
  })

  it("allows final failure only after every solution path has an explicit disposition", () => {
    const result = assessSolutionPathExhaustion(completeReviews)

    expect(result.complete).toBe(true)
    expect(result.canFinalizeFailure).toBe(true)
    expect(result.reviewedPaths).toHaveLength(8)
  })

  it("blocks final failure while a reviewed solution path remains available", () => {
    const result = assessSolutionPathExhaustion(completeReviews.map((review) =>
      review.path === "direct_answer" ? { ...review, disposition: "available" as const } : review,
    ))
    expect(result.complete).toBe(true)
    expect(result.canFinalizeFailure).toBe(false)
  })

  it("preserves partial results and workaround guidance for the final-response boundary", () => {
    const result = assessSolutionPathExhaustion(completeReviews)

    expect(result.partialResultRefs).toEqual(["output:local-plan"])
    expect(result.workaroundGuidance).toEqual([
      "Connect Yeonjang and retry the computer-control step.",
    ])
  })

  it("rejects dispositions that do not carry their required evidence", () => {
    expect(() => assessSolutionPathExhaustion([
      ...completeReviews.filter((review) => review.path !== "partial_completion"),
      { path: "partial_completion", disposition: "completed_partial", reasonCode: "partial" },
    ])).toThrow(/resultRefs/)

    expect(() => assessSolutionPathExhaustion([
      ...completeReviews.filter((review) => review.path !== "workaround_guidance"),
      { path: "workaround_guidance", disposition: "guidance_ready", reasonCode: "manual" },
    ])).toThrow(/guidance/)
  })
})
