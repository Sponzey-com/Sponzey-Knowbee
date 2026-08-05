import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { buildAgentTerminalFailureNotice } from "../packages/core/src/agent/terminal-failure-notice.ts"
import { deliverChunk } from "../packages/core/src/runs/delivery.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0815-text-chunk-kind-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function firstAttemptDetail(runId: string): Record<string, unknown> {
  const event = listMessageLedgerEvents({ runId, limit: 100 }).find(
    (item) => item.event_kind === "delivery_attempted",
  )
  return JSON.parse(event?.detail_json ?? "{}")
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

describe("task0815 text chunk notice delivery kind", () => {
  it("classifies non-final diagnostic text chunks as diagnostic delivery", async () => {
    await deliverChunk({
      onChunk: async () => undefined,
      chunk: {
        type: "text",
        delta: "도구 실행 실패 안내",
        textSource: "runtime_deterministic",
        notice: buildAgentTerminalFailureNotice({
          toolName: "screen_capture",
          reason: "path_bug",
          trustedDeterministic: true,
        }),
      },
      runId: "run-task0815-diagnostic",
      source: "telegram",
    })

    expect(firstAttemptDetail("run-task0815-diagnostic")).toMatchObject({
      deliveryKind: "diagnostic",
      chunkType: "text",
    })
  })

  it("keeps text chunks without notice as final delivery", async () => {
    await deliverChunk({
      onChunk: async () => undefined,
      chunk: {
        type: "text",
        delta: "최종 답변입니다.",
        textSource: "llm_generated",
      },
      runId: "run-task0815-final",
      source: "telegram",
    })

    expect(firstAttemptDetail("run-task0815-final")).toMatchObject({
      deliveryKind: "final",
      chunkType: "text",
    })
  })
})
