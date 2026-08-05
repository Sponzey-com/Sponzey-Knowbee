import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const promptsDir = join(process.cwd(), "prompts")

describe("task0029 intake no-early-reject prompt contract", () => {
  it("keeps capability and policy failures in the downstream diagnosis workflow", () => {
    const prompt = readFileSync(join(promptsDir, "task_intake.md"), "utf8")

    expect(prompt).toContain("Do not reject or emit a failed receipt from model intake.")
    expect(prompt).toContain("Continue actionable unsafe, unavailable, impossible, or unsupported requests as `task_intake`")
    expect(prompt).toContain("downstream policy, capability, execution, and completion diagnosis")
    expect(prompt).toContain("An explicit capability or method identifier is sufficient target information")
    expect(prompt).toContain("do not ask the user to replace an unavailable identifier")
    expect(prompt).toContain("A request to run, use, call, or execute an explicitly named capability or method is actionable `task_intake`")
    expect(prompt).toContain("An explanation that the named capability is unavailable does not satisfy the requested action and is not a `direct_answer`")
  })

  it("keeps the legacy planner aligned with the four model intake categories", () => {
    const prompt = readFileSync(join(promptsDir, "planner.md"), "utf8")

    expect(prompt).toContain("Classify the request into exactly one of these four categories.")
    expect(prompt).not.toContain("- `reject`:")
    expect(prompt).toContain("`failed_receipt` is reserved for deterministic or provider failure delivery")
  })

  it("asks schema repair to use bounded validation issues", () => {
    const prompt = readFileSync(join(promptsDir, "task_intake_schema_retry_user.md"), "utf8")

    expect(prompt).toContain("<validation_issues>")
    expect(prompt).toContain("{{validationIssues}}")
    expect(prompt).toContain("allowlisted validation issue codes")
  })
})
