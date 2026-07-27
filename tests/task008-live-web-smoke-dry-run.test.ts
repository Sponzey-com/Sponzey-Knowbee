import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestRuntimeConfigFixture, type TestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { createArtifactStorageContext } from "../packages/core/src/artifacts/lifecycle.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createDryRunWebRetrievalLiveSmokeExecutor,
  getDefaultWebRetrievalLiveSmokeScenarios,
  isLiveWebSmokeEnabled,
  runWebRetrievalLiveSmokeScenarios,
} from "../packages/core/src/runs/web-retrieval-smoke.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task008-live-smoke-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task008 opt-in live web smoke", () => {
  it("does not run live web smoke unless KNOWBEE_LIVE_WEB_SMOKE=1", async () => {
    expect(isLiveWebSmokeEnabled()).toBe(false)
    expect(isLiveWebSmokeEnabled()).toBe(false)
    expect(isLiveWebSmokeEnabled({ KNOWBEE_LIVE_WEB_SMOKE: "1" })).toBe(true)

    const summary = await runWebRetrievalLiveSmokeScenarios({ mode: "live-run" })

    expect(summary.status).toBe("skipped")
    expect(summary.counts.skipped).toBe(getDefaultWebRetrievalLiveSmokeScenarios().length)
    expect(summary.results.every((result) => result.reason === "live_web_smoke_disabled")).toBe(true)
  })

  it("runs live web smoke only when live env is explicitly supplied", async () => {
    const summary = await runWebRetrievalLiveSmokeScenarios({
      mode: "live-run",
      env: { KNOWBEE_LIVE_WEB_SMOKE: "1" },
      executeScenario: createDryRunWebRetrievalLiveSmokeExecutor(),
    })

    expect(summary.status).toBe("passed")
    expect(summary.counts).toEqual({ total: 4, passed: 4, failed: 0, skipped: 0 })
  })

  it("redacts thrown scenario failures before storing live smoke reasons", async () => {
    const rawToken = "sk-live-smoke-secret-1234567890"
    const rawPath = "/Users/test/private/live-smoke.html"
    const summary = await runWebRetrievalLiveSmokeScenarios({
      mode: "dry-run",
      executeScenario: async () => {
        throw new Error(`live smoke failed token=${rawToken} path=${rawPath} <html><body>blocked</body></html>`)
      },
    })

    expect(summary.status).toBe("failed")
    expect(summary.counts.failed).toBe(getDefaultWebRetrievalLiveSmokeScenarios().length)
    expect(summary.results.every((result) => result.reason === "[html content hidden]")).toBe(true)
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain(rawToken)
    expect(serialized).not.toContain(rawPath)
    expect(serialized).not.toContain("<html>")
  })

  it("runs deterministic dry-run scenarios and writes sanitized diagnostic artifact", async () => {
    const summary = await runWebRetrievalLiveSmokeScenarios({
      mode: "dry-run",
      writeArtifact: true,
      artifactStorage: createArtifactStorageContext(runtimeFixture.paths),
      executeScenario: createDryRunWebRetrievalLiveSmokeExecutor({
        traceOverrides: {
          nasdaq: {
            finalText: "dry-run sent without Bearer super-secret-token and without /Users/test/raw.html",
            rawError: "Bearer super-secret-token <html>blocked</html> /Users/test/raw.html",
          },
        },
      }),
    })

    expect(summary.status).toBe("passed")
    expect(summary.counts).toEqual({ total: 4, passed: 4, failed: 0, skipped: 0 })
    expect(summary.artifactPath).toBeTruthy()
    expect(summary.artifactPath ? existsSync(summary.artifactPath) : false).toBe(true)
    const artifact = readFileSync(summary.artifactPath!, "utf-8")
    expect(artifact).not.toContain("super-secret-token")
    expect(artifact).not.toContain("/Users/test")
    expect(artifact).not.toContain("<html>")
    expect(artifact).toContain("[secret hidden]")
  })
})
