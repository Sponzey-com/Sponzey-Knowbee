import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const PROPOSAL_MARKERS = [
  "Every prompt improvement proposal must include:",
  "`problem`",
  "`target_files`",
  "`module_boundary_review`",
  "`risk_level` must be `low`, `medium`, or `high`.",
  "Any harness change is `high` risk and must include non-empty `harness_change_scope` and `harness_guardrails_to_preserve`.",
  "`clarity_review` must confirm the prompt states actor, condition, allowed behavior, forbidden behavior, and completion criteria without ambiguous wording.",
  "`brevity_review` must confirm the prompt is concise and does not repeat existing rules.",
  "`module_boundary_review` must confirm each new rule belongs to the target canonical prompt module and does not duplicate another module.",
] as const

const DIFF_LIMIT_MARKERS = [
  "Reject a diff that rewrites unrelated prompt sections.",
  "Reject a diff that duplicates a rule already owned by another canonical prompt module.",
  "Reject a diff that removes or weakens safety, permission, identity, memory, delegation, Yeonjang, approval, audit, rollback, activation, or stop-condition rules.",
  "Reject a diff that broadens tool, MCP, or external feature connection access.",
  "Reject a diff that applies a changed harness to the current run before validation, approval, and activation confirmation.",
  "Reject a diff that introduces unverifiable wording such as \"appropriately\", \"as needed\", \"improve later\", \"if possible\", \"well\", \"enough\", or \"automatically decide\".",
  "If a broad rewrite is necessary, first create a separate architecture note explaining why small diffs are insufficient.",
] as const

describe("task0306 prompt improvement proposal contract", () => {
  it("requires structured proposal fields, risk classification, review gates, and diff limits", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "prompt_improvement.md"), "utf-8")

    expect(prompt).toContain("## Proposal Contract")
    for (const marker of PROPOSAL_MARKERS) {
      expect(prompt).toContain(marker)
    }

    expect(prompt).toContain("## Diff Limit Contract")
    for (const marker of DIFF_LIMIT_MARKERS) {
      expect(prompt).toContain(marker)
    }
  })
})
