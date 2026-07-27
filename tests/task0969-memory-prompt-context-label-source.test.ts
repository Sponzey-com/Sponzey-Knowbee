import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

describe("task0969 memory prompt context labels source", () => {
  it("registers memory prompt context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "memory_prompt_context_labels_user",
    )

    expect(source).toMatchObject({ sourceId: "memory_prompt_context_labels_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("relevant_memory_header=[Relevant Memory]")
    expect(source?.content).toContain("flash_feedback_header=[Immediate User Feedback]")
    expect(source?.content).toContain("flash_feedback_note=This feedback is a short-lived execution correction")
  })

  it("removes prompt labels from memory runtime code", () => {
    const storeSource = readFileSync(join(repoRoot, "packages/core/src/memory/store.ts"), "utf8")
    const flashFeedbackSource = readFileSync(join(repoRoot, "packages/core/src/memory/flash-feedback.ts"), "utf8")

    expect(storeSource).not.toContain("`[Relevant Memory]\\n${lines.join")
    expect(flashFeedbackSource).not.toContain("`[Immediate User Feedback]\\n${lines.join")
    expect(flashFeedbackSource).not.toContain("This feedback is a short-lived execution correction, not a confirmed long-term rule.")
  })
})
