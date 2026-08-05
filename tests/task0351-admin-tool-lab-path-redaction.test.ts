import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { recordMessageLedgerEvent } from "../packages/core/src/runs/message-ledger.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-admin-tool-lab-path-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function restoreState(): void {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function seedRun(): { runId: string; requestGroupId: string; sessionKey: string } {
  const now = Date.now()
  const runId = "run-task0351-tool-lab"
  const requestGroupId = "group-task0351-tool-lab"
  const sessionKey = "session-task0351-tool-lab"
  insertSession({
    id: sessionKey,
    source: "telegram",
    source_id: "chat-task0351",
    created_at: now,
    updated_at: now,
    summary: "task0351 admin tool lab session",
  })
  createRootRun({
    id: runId,
    sessionId: sessionKey,
    requestGroupId,
    prompt: "진단 파일을 확인해줘",
    source: "telegram",
  })
  return { runId, requestGroupId, sessionKey }
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
  restoreState()
})

describe("task0351 admin tool lab redaction", () => {
  it("redacts local paths and secret-like values from summaries and tool details", async () => {
    const { runId, requestGroupId } = seedRun()
    const rawLocalPath = "/private/var/folders/task0351-admin-tool-lab/artifacts/result.json"
    const rawSecret = "sk-task0351-admin-tool-lab-secret"

    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_started",
      status: "started",
      summary: `local_shell started ${rawLocalPath} ${rawSecret}`,
      detail: {
        toolName: "local_shell",
        params: {
          cwd: rawLocalPath,
          command: `cat ${rawLocalPath}`,
          bearer: `Bearer ${rawSecret}`,
        },
      },
    })
    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_done",
      status: "succeeded",
      summary: `local_shell wrote ${rawLocalPath} ${rawSecret}`,
      detail: {
        toolName: "local_shell",
        output: {
          artifactPath: rawLocalPath,
          text: `saved ${rawLocalPath} with Bearer ${rawSecret}`,
        },
      },
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: `/api/admin/tool-lab?requestGroupId=${encodeURIComponent(requestGroupId)}&limit=50` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const call = body.toolCalls.calls.find((item: any) => item.toolName === "local_shell")
      expect(call).toEqual(expect.objectContaining({
        toolName: "local_shell",
        status: "succeeded",
        eventCount: expect.any(Number),
      }))

      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain(rawLocalPath)
      expect(serialized).not.toContain(rawSecret)
      expect(serialized).toContain("[internal-path-redacted]")
      expect(serialized).toContain("***")
      expect(call.resultSummary).not.toContain(rawLocalPath)
      expect(call.lifecycle.map((event: any) => event.summary).join("\n")).not.toContain(rawLocalPath)
      expect(call.redactionApplied).toBe(true)
    } finally {
      await app.close()
    }
  })
})
