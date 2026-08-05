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
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0816-chunk-notice-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function eventDetail(runId: string, eventKind: string): Record<string, unknown> {
  const event = listMessageLedgerEvents({ runId, limit: 100 }).find(
    (item) => item.event_kind === eventKind,
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

describe("task0816 chunk notice outbox provenance", () => {
  it("records text chunk notice in delivery attempted and receipted details", async () => {
    await deliverChunk({
      onChunk: async () => ({
        textDeliveries: [{
          channel: "telegram",
          text: "도구 실행 실패 안내",
          deliveryKind: "diagnostic",
        }],
      }),
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
      runId: "run-task0816",
      source: "telegram",
    })

    expect(eventDetail("run-task0816", "delivery_attempted")).toMatchObject({
      deliveryKind: "diagnostic",
      chunkNotice: {
        kind: "agent_terminal_failure",
        textSource: "agent_terminal_failure_notice",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
    })
    expect(eventDetail("run-task0816", "delivery_receipted")).toMatchObject({
      deliveryKind: "diagnostic",
      chunkNotice: {
        kind: "agent_terminal_failure",
        deliveryMode: "diagnostic",
      },
    })
  })

  it("does not add chunkNotice for ordinary final text chunks", async () => {
    await deliverChunk({
      onChunk: async () => undefined,
      chunk: {
        type: "text",
        delta: "최종 답변입니다.",
        textSource: "llm_generated",
      },
      runId: "run-task0816-final",
      source: "telegram",
    })

    expect(eventDetail("run-task0816-final", "delivery_attempted")).not.toHaveProperty("chunkNotice")
  })
})
