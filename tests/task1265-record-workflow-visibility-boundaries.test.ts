import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")

describe("task1265 work-record, workflow, and prompt-visibility boundaries", () => {
  it("keeps work_record limited to fields, validation, transitions, and parent-child linkage", () => {
    const source = prompt("work_record")

    expect(source).toContain("structured work records")
    expect(source).toContain("required fields, validation, and state transitions")
    expect(source).toContain("explicit parent references")
    expect(source).toContain("Allowed `WorkRecordStatus` transitions")
    expect(source).toContain("request_diagnosis.md")
    expect(source).toContain("result_diagnosis.md")
    expect(source).toContain("result_review.md")
    expect(source).not.toMatch(/Do not select a recovery candidate|diagnose whether|generate recovery candidates/iu)
  })

  it("keeps workflow limited to decomposition, order, and observable completion criteria", () => {
    const source = prompt("workflow")

    expect(source).toContain("step decomposition, step order, and step completion criteria")
    expect(source).toContain("Each step must represent one verifiable action or decision")
    expect(source).toContain("Completion criteria must be observable")
    expect(source).toContain("work_record.md")
    expect(source).toContain("result_review.md")
    expect(source).not.toMatch(/A state machine must define|Do not represent complex execution flow as loose boolean flags/iu)
  })

  it("keeps prompt_visibility limited to default privacy, authorized exceptions, summary, and masking", () => {
    const source = prompt("prompt_visibility")

    expect(source).toContain("private by default")
    expect(source).toContain("Authorized Disclosure Contract")
    expect(source).toContain("Unauthorized Summary Fallback")
    expect(source).toContain("Redaction Contract")
    expect(source).toContain("provide a short behavior-policy summary")
    expect(source).not.toMatch(/Default self name:|Before dispatching a Yeonjang action|Inject memory only from|enabledWorkAbilityIds/iu)
  })
})
