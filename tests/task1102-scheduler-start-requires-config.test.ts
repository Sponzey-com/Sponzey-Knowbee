import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1102 scheduler start requires config", () => {
  it("removes scheduler start config fallbacks while keeping startup caller explicit", () => {
    const schedulerSource = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")
    const serverSource = readFileSync("packages/core/src/api/server.ts", "utf-8")

    expect(schedulerSource).toContain("memoryJournal: MemoryJournalRepository")
    expect(schedulerSource).toContain("scheduler.start(config, artifactStorage, memoryJournal, hierarchyStorage)")
    expect(schedulerSource).not.toContain("start(config: KnowbeeConfig = getConfig())")
    expect(schedulerSource).not.toContain("startScheduler(config: KnowbeeConfig = getConfig())")
    expect(serverSource).toContain("startScheduler(cfg, createArtifactStorageContext(paths), apiMemoryJournal, createAgentHierarchyStorage(paths))")
  })
})
