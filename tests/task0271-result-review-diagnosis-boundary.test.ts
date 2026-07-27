import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RESULT_REVIEW_FORBIDDEN_SCHEMA_DETAILS = [
  "The diagnosis must include `diagnosis_summary`",
  "Recommend one of: `direct_answer`",
  "generate candidates that change at least one of input",
] as const

describe("task0271 result review and diagnosis boundary", () => {
  it("keeps diagnosis schema and recovery candidate details out of result_review", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const resultReview = readFileSync(join(promptsDir, "result_review.md"), "utf-8")
    const resultDiagnosis = readFileSync(join(promptsDir, "result_diagnosis.md"), "utf-8")
    const recoveryPolicy = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8")
    const workRecord = readFileSync(join(promptsDir, "work_record.md"), "utf-8")

    for (const detail of RESULT_REVIEW_FORBIDDEN_SCHEMA_DETAILS) {
      expect(resultReview).not.toContain(detail)
    }

    expect(resultReview).toContain("result_diagnosis.md")
    expect(resultReview).toContain("recovery_policy.md")
    expect(resultDiagnosis).toContain("Return the result diagnosis fields defined in `work_record.md`.")
    expect(workRecord).toContain("diagnosis_summary")
    expect(workRecord).toContain("recommended_action")
    expect(recoveryPolicy).toContain("changed strategy")
  })
})
