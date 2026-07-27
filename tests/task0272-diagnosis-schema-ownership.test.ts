import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DIAGNOSIS_SCHEMA_DUPLICATE_MARKERS = [
  "Include these fields: `diagnosis_summary`",
  "`recommended_action` must be one of:",
  "`request_diagnosis`: return fields `diagnosis_summary`",
  "`result_diagnosis`: return fields `diagnosis_summary`",
] as const

describe("task0272 diagnosis schema ownership", () => {
  it("keeps diagnosis schema fields and action enum owned by work_record", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const workRecord = readFileSync(join(promptsDir, "work_record.md"), "utf-8")
    const requestDiagnosis = readFileSync(join(promptsDir, "request_diagnosis.md"), "utf-8")
    const resultDiagnosis = readFileSync(join(promptsDir, "result_diagnosis.md"), "utf-8")
    const schemaRepair = readFileSync(join(promptsDir, "diagnosis_schema_repair.md"), "utf-8")
    const nonOwners = [requestDiagnosis, resultDiagnosis, schemaRepair].join("\n")

    for (const marker of DIAGNOSIS_SCHEMA_DUPLICATE_MARKERS) {
      expect(nonOwners).not.toContain(marker)
    }

    expect(workRecord).toContain("RecommendedAction")
    expect(workRecord).toContain("Request diagnosis records must include")
    expect(workRecord).toContain("Result diagnosis records must include")
    expect(requestDiagnosis).toContain("work_record.md")
    expect(resultDiagnosis).toContain("work_record.md")
    expect(schemaRepair).toContain("work_record.md")
  })
})
