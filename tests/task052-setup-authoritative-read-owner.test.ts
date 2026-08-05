import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8")
}

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start)
  const endIndex = value.indexOf(end, startIndex)
  return value.slice(startIndex, endIndex)
}

describe("Task052 setup authoritative read owner", () => {
  it("models the atomic core and independent checks as explicit resources", () => {
    const store = source("../packages/webui/src/stores/setup.ts")
    expect(store).toContain("ResourceReadState<SetupCoreSnapshot>")
    expect(store).toContain("ResourceReadState<SetupChecksResponse>")
    expect(store).toContain("coreReadState")
    expect(store).toContain("checksReadState")
    expect(store).not.toContain(
      "Promise.all([api.setupStatus(), api.setupDraft(), api.setupChecks()])",
    )
  })

  it("does not manufacture defaults, raw query errors, or false disconnects on initialize failure", () => {
    const store = source("../packages/webui/src/stores/setup.ts")
    const initialize = between(store, "initialize: async", "refreshChecks: async")
    expect(initialize).not.toContain("state: createInitialSetupState()")
    expect(initialize).not.toContain("draft: createInitialSetupDraft()")
    expect(initialize).not.toContain("setDisconnected")
    expect(initialize).not.toContain("error instanceof Error ? error.message")
    expect(initialize).toContain("projectUserRecovery")
    expect(initialize).toContain('type: "load_failed"')
  })

  it("blocks route composition for initial core failure and exposes explicit refresh", () => {
    const app = source("../packages/webui/src/App.tsx")
    expect(app).toContain("setupCoreReadState")
    expect(app).toContain('setupCoreReadState.status === "failed"')
    expect(app).toContain("ResourceReadStatusNotice")
    expect(app).toContain("initializeSetup(true)")
  })

  it("projects checks failure independently on setup and settings", () => {
    const page = source("../packages/webui/src/pages/SetupPage.tsx")
    expect(page).toContain("coreReadState")
    expect(page).toContain("checksReadState")
    expect(page).toContain("ResourceReadStatusNotice")
    expect(page).toContain('checksReadState.status === "stale"')
    expect(page).toContain('checksReadState.status === "failed"')
    expect(page).toContain('coreReadState.status === "stale"')
    expect(page).not.toContain("checksReadState.failure?.safeMessage")
  })
})
