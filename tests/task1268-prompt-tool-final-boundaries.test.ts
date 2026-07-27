import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")

describe("task1268 prompt-improvement, tool, and final-response boundaries", () => {
  it("keeps prompt_improvement limited to controlled proposal, approval, activation, validation, and rollback", () => {
    const source = prompt("prompt_improvement")

    expect(source).toContain("explicit user or administrator request for a harness rule")
    expect(source).toContain("represented as a state machine, not loose flag combinations")
    expect(source).toContain("Prompt source writes and runtime activation are separate actions")
    expect(source).toContain("must not apply a changed harness to the current run")
    expect(source).toContain("rollback source must have an exact source reference")
    expect(source).toContain("final_response.md")
    expect(source).not.toMatch(/Answer only in the user's question language|Select the answer language from the original user request/iu)
  })

  it("keeps tool_policy limited to capability, authorization, invocation evidence, and audit", () => {
    const source = prompt("tool_policy")

    expect(source).toContain("Skill, MCP, and tool selection")
    expect(source).toContain("registered capability binding")
    expect(source).toContain("explicit authorization")
    expect(source).toContain("auditable invocation and result evidence")
    expect(source).toContain("yeonjang_policy.md")
    expect(source).toContain("result_review.md")
    expect(source).not.toMatch(/Prefer the connected local execution extension|When work is blocked or impossible/iu)
  })

  it("keeps final_response limited to LLM rendering, request language, uncertainty, failure, and completion", () => {
    const source = prompt("final_response")

    expect(source).toContain("Route every user-facing natural-language answer through the LLM response layer")
    expect(source).toContain("Answer only in the user's question language")
    expect(source).toContain("Preserve important uncertainty")
    expect(source).toContain("Report completion only when the requested outcome exists")
    expect(source).toContain("result_review.md")
    expect(source).not.toMatch(/Identify at least one viable solution path|failure diagnosis|recovery candidates/iu)
  })
})
