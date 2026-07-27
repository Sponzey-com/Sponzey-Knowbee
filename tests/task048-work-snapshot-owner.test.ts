import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("Task048 canonical work snapshot owner", () => {
  it("provides one bounded API projection for runs, tasks, and operations", () => {
    const routeSource = source("../packages/core/src/api/routes/runs.ts")
    expect(routeSource).toContain('"/api/work/snapshot"')
    expect(routeSource).toContain("listTaskSnapshot(30, 300)")
    expect(routeSource).toContain("operationsSummary:")
  })

  it("initializes the WebUI runs store through only the work snapshot owner", () => {
    const storeSource = source("../packages/webui/src/stores/runs.ts")
    const initializer = storeSource.slice(
      storeSource.indexOf("ensureInitialized: async"),
      storeSource.indexOf("refresh: async"),
    )
    expect(initializer).toContain("api.workSnapshot()")
    expect(initializer).not.toContain("api.tasks()")
    expect(initializer).not.toContain("api.runOperationsSummary()")
  })

  it("keeps refresh projection on the same single owner", () => {
    const storeSource = source("../packages/webui/src/stores/runs.ts")
    const refreshProjection = storeSource.slice(
      storeSource.indexOf("async function refreshTasksSnapshot"),
      storeSource.indexOf("function queueTasksRefresh"),
    )
    expect(refreshProjection.match(/api\.workSnapshot\(\)/g)).toHaveLength(1)
    expect(refreshProjection).not.toContain("Promise.all")
  })

  it("loads internal prompt prefix files once per task projection", () => {
    const taskModelSource = source("../packages/core/src/runs/task-model.ts")
    const classifier = taskModelSource.slice(
      taskModelSource.indexOf("function classifyAttemptKind"),
      taskModelSource.indexOf("const INTERNAL_ATTEMPT_KIND_PREFIXES"),
    )
    const projection = taskModelSource.slice(
      taskModelSource.indexOf("export function buildTaskModels"),
    )
    expect(classifier).not.toContain("internalRunPromptPrefix(")
    expect(projection.match(/internalRunPromptPrefixSnapshot\(\)/g)).toHaveLength(1)
  })
})
