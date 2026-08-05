import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task007-doctor-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir, configText: `{
    ai: { connection: { provider: "ollama", endpoint: "http://127.0.0.1:11434", model: "llama3.2" } },
    search: {},
    webui: { enabled: true, host: "127.0.0.1", port: 18181, auth: { enabled: false } },
    security: { approvalMode: "off" },
    memory: { searchMode: "fts", sessionRetentionDays: 30 },
    scheduler: { enabled: false, timezone: "Asia/Seoul" }
  }` })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task007 doctor web retrieval", () => {
  it("reports direct fetch provider order and recent counters without web search", () => {
    const report = runDoctor({ config: runtimeFixture.config, paths: runtimeFixture.paths, mode: "quick", includeEnvironment: false, includeReleasePackage: false })
    const check = report.checks.find((item) => item.name === "web.retrieval")
    expect(check).toBeTruthy()
    expect(check?.status).toBe("ok")
    expect(check?.detail).toEqual(expect.objectContaining({
      webSearch: "removed",
      providerOrder: [
        "web_fetch: direct fetch",
        "llm_planner: next evidence-acquisition action",
        "llm_result_diagnosis: completion or changed strategy",
      ],
      recent: expect.objectContaining({ conflictCount: 0, plannerSchemaFailureCount: 0, failedAttemptCount: 0 }),
    }))
    const serialized = JSON.stringify(check?.detail)
    expect(serialized).not.toContain("duckduckgo")
    expect(serialized).not.toContain("selenium-webdriver")
    expect(serialized).not.toContain("browserPreference")
    expect(serialized).not.toMatch(/sk-|Bearer\s+/u)
  })
})
