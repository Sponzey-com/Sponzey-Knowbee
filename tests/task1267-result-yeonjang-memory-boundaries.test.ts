import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const prompts = join(process.cwd(), "prompts")
const prompt = (name: string): string => readFileSync(join(prompts, `${name}.md`), "utf8")

describe("task1267 result-review, Yeonjang, and memory boundaries", () => {
  it("keeps result_review limited to diagnosis, sufficiency, recovery, and next-action recommendation", () => {
    const source = prompt("result_review")

    expect(source).toContain("LLM-based result diagnosis")
    expect(source).toContain("sufficiency, evidence, missing information, conflicts, risks")
    expect(source).toContain("failure diagnosis")
    expect(source).toContain("recovery candidates")
    expect(source).toContain("next-action recommendation")
    expect(source).toContain("final_response.md")
    expect(source).not.toMatch(/Answer only in the user's question language|When work is blocked or impossible, include result/iu)
  })

  it("keeps yeonjang_policy limited to targeting, unavailable fallback, permission, and control safety", () => {
    const source = prompt("yeonjang_policy")

    expect(source).toContain("local Yeonjang instance, remote Yeonjang instances")
    expect(source).toContain("Target the exact Yeonjang instance")
    expect(source).toContain("If no Yeonjang instance is available")
    expect(source).toContain("require approval before dispatch")
    expect(source).toContain("result_review.md")
    expect(source).toContain("final_response.md")
    expect(source).not.toMatch(/When a Yeonjang action fails, diagnose whether|When reporting a Yeonjang result to the user/iu)
  })

  it("keeps memory_policy limited to owner-scoped lifecycle, isolation, compaction, retention, and handoff", () => {
    const source = prompt("memory_policy")

    expect(source).toContain("independent short-term memory and independent long-term memory")
    expect(source).toContain("DataExchangePackage")
    expect(source).toContain("Sub-Agent Memory Isolation")
    expect(source).toContain("Long-Term Write Gate")
    expect(source).toContain("Run compaction only after preserving pending approvals")
    expect(source).toContain("archive handling")
    expect(source).toContain("output_policy.md")
    expect(source).not.toContain("do not expose raw errors in normal user-facing replies")
  })
})
