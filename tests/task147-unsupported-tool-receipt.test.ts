import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  closeDb,
  insertSession,
  listAuditLogsForRun,
  listMessageLedgerEvents,
} from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task147-unsupported-tool-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
  insertSession({
    id: "session-147",
    source: "webui",
    source_id: null,
    created_at: 1,
    updated_at: 1,
    summary: null,
  })
  createRootRun({
    id: "run-147",
    sessionId: "session-147",
    requestGroupId: "run-147",
    prompt: "Run an unavailable extension capability.",
    source: "webui",
  })
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("Task 147 unsupported tool receipt", () => {
  it("persists a typed unavailable-capability attempt before returning control to LLM review", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const result = await dispatcher.dispatch(
      "missing_extension_tool",
      {},
      {
        sessionId: "session-147",
        runId: "run-147",
        requestGroupId: "run-147",
        workDir: process.cwd(),
        userMessage: "Run an unavailable extension capability.",
        source: "webui",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    expect(result).toMatchObject({
      success: false,
      error: "tool_not_registered",
      details: {
        kind: "unsupported_capability",
        reasonCode: "tool_not_registered",
      },
    })
    expect(listAuditLogsForRun("run-147")).toMatchObject([
      {
        run_id: "run-147",
        request_group_id: "run-147",
        channel: "webui",
        tool_name: "missing_extension_tool",
        result: "failed",
        error_code: "tool_not_registered",
      },
    ])
    expect(listMessageLedgerEvents({ runId: "run-147" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          run_id: "run-147",
          request_group_id: "run-147",
          channel: "webui",
          event_kind: "tool_failed",
          status: "failed",
        }),
      ]),
    )
  })
})
