import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const COMPLETION_FORBIDDEN_POLICY_DETAILS = [
  "choose one next action: augment",
  "Final answers that used delegated work",
  "Current or externally retrieved facts must include",
  "continue with an alternative source",
] as const

describe("task0268 completion policy boundary", () => {
  it("keeps diagnosis, recovery, and final wording details out of completion policy", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const completionPolicy = readFileSync(join(promptsDir, "completion_policy.md"), "utf-8")
    const resultReview = readFileSync(join(promptsDir, "result_review.md"), "utf-8")
    const finalResponse = readFileSync(join(promptsDir, "final_response.md"), "utf-8")
    const outputPolicy = readFileSync(join(promptsDir, "output_policy.md"), "utf-8")
    const recoveryPolicy = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8")

    for (const detail of COMPLETION_FORBIDDEN_POLICY_DETAILS) {
      expect(completionPolicy).not.toContain(detail)
    }

    expect(completionPolicy).toContain("result_review.md")
    expect(completionPolicy).toContain("recovery_policy.md")
    expect(completionPolicy).toContain("final_response.md")
    expect(completionPolicy).toContain("output_policy.md")
    expect(completionPolicy).toContain(
      "A verified impossible-reason result is ready for a blocked or failed report",
    )
    expect(completionPolicy).not.toContain(
      "Impossible requests complete by returning the reason",
    )
    expect(resultReview).toContain("recommended_action")
    expect(finalResponse).toContain("final user-facing natural-language answer")
    expect(outputPolicy).toContain("sub-agent results")
    expect(recoveryPolicy).toContain("changed strategy")
  })
})
