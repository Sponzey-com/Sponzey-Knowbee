import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")

describe("task1264 root, identity, and intake prompt boundaries", () => {
  it("keeps system limited to stack, priority, global invariants, and module boundaries", () => {
    const source = prompt("system")

    expect(source).toContain("## Prompt Stack Contract")
    expect(source).toContain("## Canonical Module Owners")
    expect(source).toContain("## Global Invariants")
    expect(source).toContain("## Out Of Scope")
    expect(source).not.toMatch(/Before dispatching a Yeonjang action|Inject memory only from|Classify every log event as/u)
  })

  it("keeps identity limited to product and agent names, internal IDs, user separation, and locale defaults", () => {
    const source = prompt("identity")

    expect(source).toContain("Product name:")
    expect(source).toContain("Default self name")
    expect(source).toContain("User-name boundary:")
    expect(source).toContain("internal IDs")
    expect(source).not.toMatch(/^## (?:Role|Voice|Addressing)$/mu)
    expect(source).not.toMatch(/Default style:|Mood:|Execution policy and completion standards:/u)
  })

  it("keeps task intake limited to LLM request diagnosis, clarification, solution paths, and work-start decisions", () => {
    const source = prompt("task_intake")

    expect(source).toContain("LLM-based request diagnosis")
    expect(source).toContain("clarification")
    expect(source).toContain("solution path")
    expect(source).toContain("work should start")
    expect(source).toContain("request_diagnosis.md")
    expect(source).toContain("work_record.md")
    expect(source).not.toMatch(/^## (?:Action Item Rules|Execution Semantics Rules|Web Usage Policy)$/mu)
    expect(source).not.toContain("exactly one connected Yeonjang extension")
    expect(source).not.toContain("schedule_kind")
  })
})
