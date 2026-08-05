import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task020 scheduler canonical ingress", () => {
  it("routes AI-backed scheduled requests through canonical ingress instead of runAgent", () => {
    const scheduler = readFileSync("packages/core/src/scheduler/index.ts", "utf8")
    const server = readFileSync("packages/core/src/api/server.ts", "utf8")

    expect(scheduler).toContain('import { startIngressRun } from "../runs/ingress.js"')
    expect(scheduler).not.toContain('import { runAgent } from "../agent/index.js"')
    expect(scheduler).not.toMatch(/for await \(const chunk of runAgent\(/u)
    expect(scheduler).toContain("const { started } = dependencies.startIngressRunImpl({")
    expect(scheduler).toContain("hierarchyStorage: params.hierarchyStorage")
    expect(scheduler).toContain("runId: params.scheduleRunId")
    expect(scheduler).toContain("await started.finished")
    expect(server).toContain("const artifactStorage = createArtifactStorageContext(paths)")
    expect(server).toContain("const memoryJournal = createMemoryJournalRepository(paths)")
    expect(server).toContain("const hierarchyStorage = createAgentHierarchyStorage(paths)")
    expect(server).toContain("startScheduler(cfg, artifactStorage, memoryJournal, hierarchyStorage)")
  })
})
