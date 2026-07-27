import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { registerRunsRoute } from "../packages/core/src/api/routes/runs.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { recordControlEvent } from "../packages/core/src/control-plane/timeline.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { appendRunEvent, createRootRun } from "../packages/core/src/runs/store.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string }): Promise<{ statusCode: number; json(): unknown }>
}

const INTERNAL_EVIDENCE_TEXT =
  "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-088 receipt payload raw observed state structured diagnosis payload DB row"

const tempDirs: string[] = []
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function adminUiRuntime() {
  return {
    uiModeRuntime: {
      adminActivation: {
        env: { KNOWBEE_ADMIN_UI: "1" },
        argv: [],
        nodeEnv: "development",
      },
      rollbackActivation: { env: {} },
    },
  }
}

function expectNoInternalEvidence(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).toContain("[internal-evidence-redacted]")
  expect(serialized).not.toContain("yeonjang-goal-validation")
  expect(serialized).not.toContain("operationId")
  expect(serialized).not.toContain("operation:run-088")
  expect(serialized).not.toContain("receipt payload")
  expect(serialized).not.toContain("raw observed state")
  expect(serialized).not.toContain("structured diagnosis payload")
  expect(serialized).not.toContain("DB row")
}

beforeEach(() => {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task088-routes-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task088 runtime/admin route internal evidence redaction", () => {
  it("redacts runtime inspector route response at the final projection boundary", async () => {
    const runId = "run-task088"
    const sessionId = "session-task088"
    insertSession({
      id: sessionId,
      source: "webui",
      source_id: sessionId,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: INTERNAL_EVIDENCE_TEXT,
    })
    createRootRun({
      id: runId,
      sessionId,
      requestGroupId: "group-task088",
      prompt: INTERNAL_EVIDENCE_TEXT,
      source: "webui",
    })
    appendRunEvent(runId, INTERNAL_EVIDENCE_TEXT)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerRunsRoute(app as never, {} as never)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: `/api/runs/${encodeURIComponent(runId)}/runtime-inspector` })

      expect(response.statusCode).toBe(200)
      expectNoInternalEvidence(response.json())
    } finally {
      await app.close()
    }
  })

  it("redacts admin runtime, shell, and platform inspector route responses at nested boundaries", async () => {
    recordControlEvent({
      eventType: "yeonjang.validation.failed",
      component: "yeonjang",
      severity: "warning",
      summary: INTERNAL_EVIDENCE_TEXT,
      detail: {
        operationId: "operation:run-088",
        rawObservedState: INTERNAL_EVIDENCE_TEXT,
      },
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app as never, adminUiRuntime())
    await app.ready()
    try {
      const runtime = await app.inject({ method: "GET", url: "/api/admin/runtime" })
      const shell = await app.inject({ method: "GET", url: "/api/admin/shell" })
      const platform = await app.inject({ method: "GET", url: "/api/admin/platform-inspectors?limit=50" })

      expect(runtime.statusCode).toBe(200)
      expect(shell.statusCode).toBe(200)
      expect(platform.statusCode).toBe(200)
      expectNoInternalEvidence(platform.json())
      expect(JSON.stringify(runtime.json())).not.toContain("operationId")
      expect(JSON.stringify(shell.json())).not.toContain("operationId")
    } finally {
      await app.close()
    }
  })
})
