import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const WORK_RECORD_DETAILS_FORBIDDEN_IN_WORKFLOW = [
  "WorkRecordStatus values are",
  "WorkStepStatus values are",
  "Allowed `WorkRecordStatus` transitions",
  "intake -> planned",
  "completed -> none",
] as const

describe("task0278 workflow step decomposition boundary", () => {
  it("keeps workflow focused on step decomposition and references work_record for schema", () => {
    const workflow = readFileSync(join(process.cwd(), "prompts", "workflow.md"), "utf-8")
    const workRecord = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(workflow).toContain("one verifiable action or decision")
    expect(workflow).toContain("ordered so required inputs")
    expect(workflow).toContain("completion criteria")
    expect(workflow).toContain("work_record.md")
    expect(workflow).toContain("Do not create hidden steps only in prose")

    for (const detail of WORK_RECORD_DETAILS_FORBIDDEN_IN_WORKFLOW) {
      expect(workflow).not.toContain(detail)
    }

    expect(workRecord).toContain("`WorkRecordStatus` values are")
    expect(workRecord).toContain("Allowed `WorkRecordStatus` transitions")
  })
})
