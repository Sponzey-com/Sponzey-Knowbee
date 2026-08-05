import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

describe("Task050 Runs and Agents read ownership", () => {
  it("adds an observed timestamp to the single work snapshot owner", () => {
    const route = source("../packages/core/src/api/routes/runs.ts")
    const snapshot = route.slice(
      route.indexOf('app.get("/api/work/snapshot"'),
      route.indexOf('app.get("/api/tasks"'),
    )
    expect(snapshot).toContain("observedAt:")
    expect(snapshot.match(/listTaskSnapshot\(/gu)).toHaveLength(1)
  })

  it("uses explicit read state instead of a raw Runs error string", () => {
    const store = source("../packages/webui/src/stores/runs.ts")
    expect(store).toContain("ResourceReadState")
    expect(store).toContain("reduceResourceReadState")
    expect(store).toContain("projectUserRecovery")
    expect(store).not.toContain("lastError: string")
    expect(store).not.toContain("error instanceof Error ? error.message")
    expect(store).not.toContain("useConnectionStore")
    expect(store).not.toContain("setDisconnected")
  })

  it("renders Runs failure/stale state before deciding the list is empty", () => {
    const page = source("../packages/webui/src/pages/RunsPage.tsx")
    expect(page).toContain("ResourceReadStatusNotice")
    expect(page).toContain("readState.status")
    expect(page).toContain('readState.status === "failed"')
    expect(page).toContain('readState.status === "stale"')
  })

  it("preserves the Agents page through the shared safe read-state", () => {
    const page = source("../packages/webui/src/pages/AgentsPage.tsx")
    expect(page).toContain("ResourceReadState<AgentWorkspacePageResponse>")
    expect(page).toContain("reduceResourceReadState")
    expect(page).toContain("ResourceReadStatusNotice")
    expect(page).not.toContain(
      'setError(reason instanceof Error ? reason.message : "agent_workspace_read_failed")',
    )
  })
})
