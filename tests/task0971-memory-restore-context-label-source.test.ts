import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

describe("task0971 memory restore context labels source", () => {
  it("registers memory restore context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "memory_restore_prompt_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({
      sourceId: "memory_restore_prompt_context_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("maintenance_restore_header=[maintenance_restore]")
    expect(source?.content).toContain("prompt_time_recall_header=[prompt_time_recall]")
    expect(source?.content).toContain("execution_reference_memory_header=[Execution Reference Memory]")
  })

  it("removes restore prompt labels from memory restore runtime code", () => {
    const restoreSource = readFileSync(join(repoRoot, "packages/core/src/memory/retrieval-restore.ts"), "utf8")
    const journalSource = readFileSync(join(repoRoot, "packages/core/src/memory/journal.ts"), "utf8")

    expect(restoreSource).not.toContain("\"[maintenance_restore]\"")
    expect(restoreSource).not.toContain("\"[prompt_time_recall]\"")
    expect(restoreSource).not.toContain("`[recent_capsules]\\n${items.join")
    expect(restoreSource).not.toContain("renderCapsuleInline(\"latest_compacted_capsule\"")
    expect(restoreSource).not.toContain("`latest_instruction_summary: ${")
    expect(journalSource).not.toContain("`[Execution Reference Memory]\\n${lines.join")
  })
})
