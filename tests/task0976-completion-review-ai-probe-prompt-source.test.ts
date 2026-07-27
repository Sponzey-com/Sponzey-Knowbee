import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry, loadPromptTemplate } from "../packages/core/src/memory/knowbee-md.ts"
import { loadPromptValue } from "../packages/core/src/memory/prompt-fragments.ts"

const repoRoot = process.cwd()

describe("task0976 completion review and AI probe prompt sources", () => {
  it("registers completion review labels and exposes the AI probe user value", () => {
    const registry = loadPromptSourceRegistry(repoRoot)
    const labels = registry.find((item) => item.sourceId === "completion_review_context_labels_user" && item.locale === "en")

    expect(labels).toMatchObject({ sourceId: "completion_review_context_labels_user", usageScope: "internal", enabled: true })
    expect(labels?.content).toContain("prior_assistant_results_header=Previously completed assistant results:")
    expect(loadPromptValue("ai_connection_test", {}, { required: true })).toBe("Reply with just: OK")
    expect(loadPromptTemplate({ sourceId: "ai_connection_test" })).toContain("Reply with exactly: OK")
  })

  it("removes the prompt text from runtime TypeScript", () => {
    const completionReviewSource = readFileSync(join(repoRoot, "packages/core/src/agent/completion-review.ts"), "utf8")
    const settingsSource = readFileSync(join(repoRoot, "packages/core/src/api/routes/settings.ts"), "utf8")

    expect(completionReviewSource).not.toContain("`Previously completed assistant results:\\n${")
    expect(settingsSource).not.toContain("\"Reply with just: OK\"")
  })
})
