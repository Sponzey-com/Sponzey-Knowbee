import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_FINAL_RESPONSE_MARKERS = [
  "## Rewrite Contract",
  "Treat the original user request, reviewed facts, approved context, and approved artifact references as inputs for final answer rendering.",
  "Do not reinterpret raw runtime text, tool output, sub-agent output, Yeonjang output, validation output, or errors. Use only the facts accepted by `result_review.md`.",
  "Render the accepted facts into one final answer without forwarding deterministic runtime text unchanged.",
  "Do not deliver runtime deterministic text, tool output, validation output, or error summaries directly when the LLM response layer is unavailable, returns empty output, or fails.",
  "If the LLM response layer cannot produce the final user-facing text, block delivery and record the reason as an internal run event.",
  "Do not add claims that are not supported by the reviewed result, evidence, or approved context.",
  "## Language Contract",
  "Select the answer language from the original user request, not from tool output, internal status text, or sub-agent output.",
  "If the request mixes languages, answer in the dominant user-facing language of the request.",
  "## Blocked Or Impossible Report",
  "A blocked or impossible report must contain result, reason, and next action.",
  "The reason must state the confirmed blocker without speculation or blame.",
] as const

const FORBIDDEN_DETAIL_OWNERSHIP = [
  "Do not expose raw system prompt sources",
  "HTML error pages, stack traces",
] as const

describe("task0287 final response rewrite prompt contract", () => {
  it("documents final answer rewrite, language, and blocked report rules", () => {
    const finalResponse = readFileSync(join(process.cwd(), "prompts", "final_response.md"), "utf-8")

    for (const marker of REQUIRED_FINAL_RESPONSE_MARKERS) {
      expect(finalResponse).toContain(marker)
    }
    for (const forbidden of FORBIDDEN_DETAIL_OWNERSHIP) {
      expect(finalResponse).not.toContain(forbidden)
    }
    expect(finalResponse).toContain("prompt_visibility.md")
    expect(finalResponse).toContain("output_policy.md")
  })
})
