import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0817-suppressed-text-notice-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function deliveryDependencies() {
  return {
    now: () => 0,
    createId: () => "message-1",
    insertMessage: vi.fn(),
    emitStart: vi.fn(),
    emitStream: vi.fn(),
    emitEnd: vi.fn(),
    writeReplyLog: vi.fn(),
  }
}

function suppressedDetail(runId: string): Record<string, unknown> {
  const event = listMessageLedgerEvents({ runId, limit: 100 }).find(
    (item) => item.event_kind === "text_delivery_suppressed",
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

describe("task0817 suppressed text delivery notice", () => {
  it("marks child direct final delivery suppression as non-final", async () => {
    await emitAssistantTextDelivery({
      runId: "run-task0817-child",
      parentRunId: "run-task0817-parent",
      subSessionId: "sub-task0817",
      sessionId: "session-task0817",
      text: "하위 에이전트 최종 답변",
      source: "telegram",
      onChunk: vi.fn(),
      deliveryKind: "final",
      dependencies: deliveryDependencies(),
    })

    expect(suppressedDetail("run-task0817-child")).toMatchObject({
      deliveryNotice: {
        kind: "assistant_text_delivery",
        deliveryMode: "final",
        textSource: "assistant_text_delivery_notice",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
      reasonCode: "child_direct_final_delivery_blocked",
    })
  })

  it("marks duplicate final delivery suppression as non-final", async () => {
    const deps = deliveryDependencies()
    await emitAssistantTextDelivery({
      runId: "run-task0817-duplicate",
      sessionId: "session-task0817",
      text: "최종 답변입니다.",
      source: "webui",
      onChunk: undefined,
      deliveryKind: "final",
      dependencies: deps,
    })
    await emitAssistantTextDelivery({
      runId: "run-task0817-duplicate",
      sessionId: "session-task0817",
      text: "최종 답변입니다.",
      source: "webui",
      onChunk: undefined,
      deliveryKind: "final",
      dependencies: deps,
    })

    expect(suppressedDetail("run-task0817-duplicate")).toMatchObject({
      deliveryNotice: {
        deliveryMode: "final",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
    })
  })
})
