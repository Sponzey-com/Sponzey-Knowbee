import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertSession, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { commitFinalDelivery } from "../packages/core/src/runs/channel-finalizer.ts"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import {
  buildTextDeliveryKey,
  recordMessageLedgerEvent,
} from "../packages/core/src/runs/message-ledger.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture("knowbee-task051-delivery-")
  insertSession({
    id: "session:task051",
    source: "telegram",
    source_id: "chat:task051",
    created_at: 1,
    updated_at: 1,
    summary: "task051",
  })
  createRootRun({
    id: "run:task051",
    sessionId: "session:task051",
    requestGroupId: "group:task051",
    prompt: "deliver once",
    source: "telegram",
  })
})

afterEach(() => runtime.dispose())

describe("Task 051 durable final-delivery admission", () => {
  it("admits only one concurrent caller to the channel delivery handler", async () => {
    let releaseFirst = () => undefined
    let markFirstStarted = () => undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const onChunk = vi.fn(async (chunk: { type: string }) => {
      if (chunk.type !== "text") return undefined
      if (onChunk.mock.calls.filter(([value]) => value.type === "text").length === 1) {
        markFirstStarted()
        await firstGate
      }
      return undefined
    })
    const input = {
      runId: "run:task051",
      sessionId: "session:task051",
      text: "final answer",
      source: "telegram" as const,
      onChunk,
      deliveryKind: "final" as const,
    }

    const first = emitAssistantTextDelivery(input)
    await firstStarted
    const second = emitAssistantTextDelivery(input)
    releaseFirst()
    await Promise.all([first, second])

    expect(onChunk.mock.calls.filter(([chunk]) => chunk.type === "text")).toHaveLength(1)
  })

  it("does not resend when restart finds an unresolved started admission", async () => {
    const text = "restart-sensitive final answer"
    const deliveryKey = buildTextDeliveryKey("telegram", "session:task051", text)
    const idempotencyKey = `text-delivery:run:task051:telegram:${deliveryKey}`
    recordMessageLedgerEvent({
      runId: "run:task051",
      sessionKey: "session:task051",
      channel: "telegram",
      eventKind: "delivery_attempted",
      deliveryKind: "final",
      deliveryKey,
      idempotencyKey,
      status: "started",
      summary: "final delivery admitted",
    })
    const onChunk = vi.fn()

    const result = await emitAssistantTextDelivery({
      runId: "run:task051",
      sessionId: "session:task051",
      text,
      source: "telegram",
      onChunk,
      deliveryKind: "final",
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      persisted: false,
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "in_flight_unknown",
    })
  })

  it("does not automatically retry a failed admission under the same key", async () => {
    const onChunk = vi.fn(async () => {
      throw new Error("provider unavailable")
    })
    const input = {
      runId: "run:task051",
      sessionId: "session:task051",
      text: "failure-sensitive final answer",
      source: "telegram" as const,
      onChunk,
      deliveryKind: "final" as const,
    }

    const first = await emitAssistantTextDelivery(input)
    const callsAfterFailure = onChunk.mock.calls.length
    const second = await emitAssistantTextDelivery(input)

    expect(first).toMatchObject({ textDelivered: false, doneDelivered: false })
    expect(second).toMatchObject({
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "previous_failed",
    })
    expect(onChunk).toHaveBeenCalledTimes(callsAfterFailure)
    expect(
      listMessageLedgerEvents({ runId: "run:task051", limit: 100 }).find(
        (event) => event.event_kind === "text_delivery_failed",
      ),
    ).toMatchObject({ status: "failed" })
  })

  it("keeps an unresolved admission out of final and canonical committed states", async () => {
    const text = "finalizer restart-sensitive answer"
    const deliveryKey = buildTextDeliveryKey("telegram", "session:task051", text)
    const idempotencyKey = `text-delivery:run:task051:telegram:${deliveryKey}`
    recordMessageLedgerEvent({
      runId: "run:task051",
      sessionKey: "session:task051",
      channel: "telegram",
      eventKind: "delivery_attempted",
      deliveryKind: "final",
      deliveryKey,
      idempotencyKey,
      status: "started",
      summary: "final delivery admitted",
    })
    const rawText = `review:${text}`
    const onChunk = vi.fn()

    const result = await commitFinalDelivery({
      parentRunId: "run:task051",
      sessionId: "session:task051",
      source: "telegram",
      text,
      onChunk,
      responseReview: {
        rawText,
        rawTextSource: "llm_generated",
        contentKind: "final_report",
        expectedLanguage: "unknown",
        receipt: buildLlmResponseReviewReceipt({
          rawText,
          responseText: text,
          rawTextSource: "llm_generated",
          contentKind: "final_report",
        }),
      },
    })

    expect(result).toMatchObject({
      status: "delivery_failed",
      reasonCodes: ["delivery_admission_in_flight_unknown"],
    })
    expect(onChunk).not.toHaveBeenCalled()
    expect(
      listMessageLedgerEvents({ runId: "run:task051", limit: 100 }).some(
        (event) => event.event_kind === "final_answer_delivered",
      ),
    ).toBe(false)
  })
})
