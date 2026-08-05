import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_MARKERS = [
  "`FailureDiagnosis` required fields are `failed_step_id`, `failure_reason`, `failed_input_refs`, `failed_strategy`, and `recoverable`.",
  "`failure_diagnosis.failed_input_refs` items must be non-empty.",
  "`failure_diagnosis.failed_input_refs` items must be unique.",
  "`failure_diagnosis.failed_step_id` must exist in `step_plan` for work records.",
  "`failure_diagnosis.failed_step_id` must exist in `failed_steps` for child work results.",
  "`failure_diagnosis.failed_step_id` must not reference a `completed` or `skipped` work-record step.",
  "`RecoveryCandidate` required fields are `action_type`, `changed_input_or_strategy`, `expected_benefit`, `risk`, and `changed_dimensions`.",
  "`required_permission`, when present, must be non-empty.",
  "`metadata`, when present, must be a JSON object without `undefined` values.",
  "`metadata` keys, when present at any object depth, must be non-empty.",
  "`ActionDecision` required fields are `selected_action` and `reason`.",
  "`action_decision.next_step_id`, when present, must be non-empty.",
  "`changed_dimensions` must contain one or more `RecoveryChangedDimension` values for every recovery candidate.",
  "`changed_dimensions` items must be unique.",
  "A recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method before it can be selected.",
  "`recovery_candidates` items must be unique.",
  "`selected_recovery_action`, when present, must match one item in `recovery_candidates`.",
  "`selected_recovery_action` matching includes optional `required_permission` and `metadata` values.",
  "`selected_recovery_action`, when present with `failure_diagnosis`, must change input, strategy, tool, delegation target, permission, scope, or validation method.",
  "`failed` work records require `failure_diagnosis`, one or more `recovery_candidates`, `selected_recovery_action`, and non-empty `stop_condition`.",
] as const

const FORBIDDEN_RESULT_REVIEW_SCHEMA_MARKERS = [
  "`FailureDiagnosis` required fields are",
  "`RecoveryCandidate` required fields are",
  "`ActionDecision` required fields are",
] as const

describe("task0282 recovery record prompt contract", () => {
  it("documents failure recovery record structures in work_record", () => {
    const workRecord = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(workRecord).toContain("## Failure Recovery Record Contract")
    for (const marker of REQUIRED_MARKERS) {
      expect(workRecord).toContain(marker)
    }
  })

  it("keeps result review focused on diagnosis meaning instead of recovery schema fields", () => {
    const resultReview = readFileSync(join(process.cwd(), "prompts", "result_review.md"), "utf-8")

    expect(resultReview).toContain("Follow `work_record.md` for `FailureDiagnosis`, `RecoveryCandidate`, and `ActionDecision` record structures.")
    expect(resultReview).toContain("does not own work-record, failure-diagnosis, recovery-candidate, or action-decision schema fields")
    for (const marker of FORBIDDEN_RESULT_REVIEW_SCHEMA_MARKERS) {
      expect(resultReview).not.toContain(marker)
    }
  })
})
