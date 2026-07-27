import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1132 scheduler runtime config required", () => {
  it("uses only stored or explicit config after bootstrap", () => {
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")

    expect(source).toContain("private requireConfig(config?: KnowbeeConfig): KnowbeeConfig")
    expect(source).toContain("if (this.config) return this.config")
    expect(source).toContain("throw new Error(\"scheduler runtime config is not initialized\")")
    expect(source).not.toContain("import { getConfig }")
    expect(source).not.toContain("this.config ?? getConfig()")
  })

  it("requires config for public health and manual execution calls", () => {
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")
    const cli = readFileSync("packages/cli/src/commands/schedule.ts", "utf-8")

    expect(source).toContain("getHealth(config: KnowbeeConfig)")
    expect(source).toContain("artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository")
    expect(source).toContain("return scheduler.runNow(scheduleId, trigger, config, artifactStorage, memoryJournal)")
    expect(source).toContain("return scheduler.runNowAndWait(scheduleId, trigger, config, artifactStorage, memoryJournal)")
    expect(cli).toContain("const config = await bootstrapRuntime()")
    expect(cli).not.toContain("getConfig")
    expect(cli).toContain("startChannels(config, paths)")
    expect(cli).toContain("createArtifactStorageContext(paths)")
    expect(cli).toContain("createMemoryJournalRepository(paths)")
  })
})
