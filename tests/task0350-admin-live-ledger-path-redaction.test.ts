import { createRequire } from "node:module"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { recordMessageLedgerEvent } from "../packages/core/src/runs/message-ledger.js"
import { createRootRun, updateRunStatus } from "../packages/core/src/runs/store.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): void {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0350-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function adminRuntimeOptions() {
  return {
    uiModeRuntime: {
      adminActivation: {
        env: { KNOWBEE_ADMIN_UI: "1" },
        nodeEnv: undefined,
      },
      rollbackActivation: { env: {} },
    },
  }
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

describe("task0350 admin live ledger path redaction", () => {
  it("masks local paths and secret-like ledger values in admin live responses", async () => {
    const now = Date.now()
    const runId = "run:task0350"
    const requestGroupId = "group:task0350"
    const sessionKey = "session:task0350"
    const artifactDir = makeTempDir("knowbee-task0350-artifact-")
    const artifactPath = join(artifactDir, "private-output.txt")
    writeFileSync(artifactPath, "private output", "utf-8")

    insertSession({
      id: sessionKey,
      source: "telegram",
      source_id: "chat-task0350",
      created_at: now,
      updated_at: now,
      summary: "task0350 session",
    })
    createRootRun({
      id: runId,
      sessionId: sessionKey,
      requestGroupId,
      prompt: "artifact delivery",
      source: "telegram",
    })
    recordMessageLedgerEvent({
      runId,
      requestGroupId,
      eventKind: "artifact_delivery_failed",
      deliveryKey: `artifact:telegram:${artifactPath}`,
      idempotencyKey: `idempotency:${artifactPath}`,
      status: "failed",
      summary: `artifact delivery failed for ${artifactPath}`,
      detail: {
        channelTarget: "chat-task0350",
        filePath: artifactPath,
        token: "sk-task0350-ledger-secret-value",
      },
    })
    updateRunStatus(runId, "failed", `failed at ${artifactPath}`, false)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/admin/live?requestGroupId=${encodeURIComponent(requestGroupId)}&limit=100`,
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const serialized = JSON.stringify(body)
      expect(serialized).toContain("[internal-path-redacted]")
      expect(serialized).toContain("***")
      expect(serialized).not.toContain(artifactPath)
      expect(serialized).not.toContain(artifactDir)
      expect(serialized).not.toContain("sk-task0350-ledger-secret-value")
      const artifactEvent = body.messageLedger.events.find((event: any) => event.eventKind === "artifact_delivery_failed")
      expect(artifactEvent?.channelTarget).toBe("chat-task0350")
      expect(body.messageLedger.summary).toEqual(expect.objectContaining({ deliveryFailures: 1 }))
      expect(body.runsInspector.runs[0].delivery).toEqual(expect.objectContaining({ status: "failed" }))
    } finally {
      await app.close()
    }
  })
})
