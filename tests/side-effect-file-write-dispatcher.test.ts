import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { fileWriteTool } from "../packages/core/src/tools/builtin/file.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-side-effect-file-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  insertSession({ id: "session-1", source: "webui", source_id: null, created_at: now, updated_at: now, summary: null })
  createRootRun({ id: "run-1", sessionId: "session-1", prompt: "write file", source: "webui" })
})

afterEach(() => {
  vi.restoreAllMocks()
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("file_write side-effect dispatcher integration", () => {
  it("executes an exact operation once and rejects changed params in the same target scope", async () => {
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off", allowedPaths: [stateDir] },
      },
    })
    dispatcher.register(fileWriteTool)
    const execute = vi.spyOn(fileWriteTool, "execute")
    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_run"))
    const path = join(stateDir, "result.txt")
    const ctx = {
      sessionId: "session-1",
      runId: "run-1",
      requestGroupId: "run-1",
      workDir: stateDir,
      userMessage: "write file",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    try {
      const first = await dispatcher.dispatch("file_write", { path, content: "first" }, ctx as never)
      const replay = await dispatcher.dispatch("file_write", { path, content: "first" }, ctx as never)
      const changed = await dispatcher.dispatch("file_write", { path, content: "changed" }, ctx as never)

      expect(first.success).toBe(true)
      expect(replay).toMatchObject({ success: true, details: { kind: "side_effect_duplicate_verified" } })
      expect(changed).toMatchObject({ success: false, error: "SIDE_EFFECT_OPERATION_BLOCKED" })
      expect(execute).toHaveBeenCalledTimes(1)
      expect(readFileSync(path, "utf-8")).toBe("first")
    } finally {
      detach()
    }
  })
})
