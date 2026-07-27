import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { buildAssistantTextDeliveryNotice } from "../packages/core/src/runs/assistant-text-delivery-notice.ts"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0814-text-delivery-notice-"))
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

describe("task0814 assistant text delivery notice", () => {
  it("builds final and progress text delivery notice metadata", () => {
    expect(buildAssistantTextDeliveryNotice({
      deliveryKind: "final",
      delivered: true,
    })).toEqual({
      kind: "assistant_text_delivery",
      deliveryMode: "final",
      textSource: "assistant_text_delivery_notice",
      finalAnswer: true,
      assistantIdentityClaim: false,
    })
    expect(buildAssistantTextDeliveryNotice({
      deliveryKind: "progress",
      delivered: true,
    })).toMatchObject({
      deliveryMode: "progress",
      finalAnswer: false,
    })
  })

  it("records final text delivery notice in text ledger detail", async () => {
    const receipt = await emitAssistantTextDelivery({
      runId: "run-task0814-final",
      sessionId: "session-task0814",
      text: "요청한 작업을 완료했습니다.",
      source: "webui",
      onChunk: undefined,
      deliveryKind: "final",
      monotonicNow: () => 30_000,
      dependencies: deliveryDependencies(),
    })
    expect(receipt).toMatchObject({
      runId: "run-task0814-final",
      receiptRef: expect.stringMatching(/^message-ledger:/u),
      deliveredAtMs: 30_000,
    })

    const delivered = listMessageLedgerEvents({ runId: "run-task0814-final", limit: 100 }).find(
      (event) => event.event_kind === "text_delivered",
    )
    const detail = JSON.parse(delivered?.detail_json ?? "{}")

    expect(detail.deliveryNotice).toMatchObject({
      kind: "assistant_text_delivery",
      deliveryMode: "final",
      textSource: "assistant_text_delivery_notice",
      finalAnswer: true,
      assistantIdentityClaim: false,
    })
  })

  it("records progress text delivery notice as non-final", async () => {
    await emitAssistantTextDelivery({
      runId: "run-task0814-progress",
      sessionId: "session-task0814",
      text: "요청을 접수했습니다.",
      source: "webui",
      onChunk: undefined,
      deliveryKind: "progress",
      dependencies: deliveryDependencies(),
    })

    const delivered = listMessageLedgerEvents({ runId: "run-task0814-progress", limit: 100 }).find(
      (event) => event.event_kind === "text_delivered",
    )
    const detail = JSON.parse(delivered?.detail_json ?? "{}")

    expect(detail.deliveryNotice).toMatchObject({
      deliveryMode: "progress",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
