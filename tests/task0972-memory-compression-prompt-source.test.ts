import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

describe("task0972 memory compression prompt sources", () => {
  it("registers compressor and root summary prompts as internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(repoRoot)
    const compressor = registry.find((item) => item.sourceId === "memory_compressor_summary_prompt_user" && item.locale === "en")
    const rootSummary = registry.find((item) => item.sourceId === "root_session_summary_prompt_user" && item.locale === "en")
    const labels = registry.find((item) => item.sourceId === "memory_restore_prompt_context_labels_user" && item.locale === "en")

    expect(compressor).toMatchObject({ sourceId: "memory_compressor_summary_prompt_user", usageScope: "internal", enabled: true })
    expect(rootSummary).toMatchObject({ sourceId: "root_session_summary_prompt_user", usageScope: "internal", enabled: true })
    expect(compressor?.content).toContain("Summarize the following conversation concisely.")
    expect(rootSummary?.content).toContain("Return JSON only.")
    expect(labels?.content).toContain("pinned_working_set_header=[pinned_working_set]")
    expect(labels?.content).toContain("previous_conversation_summary_header=[Previous Conversation Summary]")
  })

  it("removes compression prompt text and context headers from TypeScript", () => {
    const compressorSource = readFileSync(join(repoRoot, "packages/core/src/memory/compressor.ts"), "utf8")
    const compactionSource = readFileSync(join(repoRoot, "packages/core/src/memory/compaction.ts"), "utf8")

    expect(compressorSource).not.toContain("Summarize the following conversation concisely.")
    expect(compressorSource).not.toContain("[Previous Conversation Summary]\\n${summary}")
    expect(compactionSource).not.toContain("\"Return JSON only.\"")
    expect(compactionSource).not.toContain("\"[pinned_working_set]\"")
    expect(compactionSource).not.toContain("\"[pinned_working_set_retrieval_only]\"")
    expect(compactionSource).not.toContain("\"[retrieval_only_context]\"")
    expect(compactionSource).not.toContain("`summary: ${capsule.summary}`")
  })
})
