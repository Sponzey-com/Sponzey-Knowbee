import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertSession } from "../packages/core/src/db/index.js"
import { commitFinalDelivery } from "../packages/core/src/runs/channel-finalizer.ts"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import { cancelRootRun, createRootRun } from "../packages/core/src/runs/store.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture("knowbee-task053-cancellation-report-")
  insertSession({
    id: "session:task053",
    source: "telegram",
    source_id: "chat:task053",
    created_at: 1,
    updated_at: 1,
    summary: "task053",
  })
  createRootRun({
    id: "run:task053",
    sessionId: "session:task053",
    requestGroupId: "group:task053",
    prompt: "cancel and report",
    source: "telegram",
  })
  cancelRootRun("run:task053")
})

afterEach(() => runtime.dispose())

describe("Task 053 cancellation report authorization", () => {
  it("delivers an authorized cancellation terminal report exactly once", async () => {
    const text = "The requested execution was cancelled."
    const onChunk = vi.fn(async (chunk: { type: string }) =>
      chunk.type === "done"
        ? {
            textDeliveries: [
              {
                channel: "telegram" as const,
                text,
                messageIds: [53],
                deliveryReceipts: [
                  {
                    channelId: "telegram:primary",
                    provider: "telegram",
                    connectionId: "telegram:primary",
                    target: { roomId: "chat:task053" },
                    status: "sent" as const,
                    timestamp: 53,
                    idempotencyKey: "telegram:task053:cancellation",
                    messageId: "53",
                  },
                ],
              },
            ],
          }
        : undefined,
    )
    const input = {
      runId: "run:task053",
      sessionId: "session:task053",
      text,
      source: "telegram" as const,
      onChunk,
      deliveryKind: "final" as const,
      cancellationReportAuthorization: {
        runId: "run:task053",
        finalOutcome: "cancelled" as const,
        receiptRef: "receipt:cancellation:run:task053:verified",
      },
    }

    const first = await emitAssistantTextDelivery(input)
    const second = await emitAssistantTextDelivery(input)

    expect(first).toMatchObject({ textDelivered: true, doneDelivered: true })
    expect(second).toMatchObject({ textDelivered: true, doneDelivered: true })
    expect(onChunk.mock.calls.filter(([chunk]) => chunk.type === "text")).toHaveLength(1)
  })

  it("rejects a cancellation authorization bound to another run", async () => {
    const onChunk = vi.fn()
    const result = await emitAssistantTextDelivery({
      runId: "run:task053",
      sessionId: "session:task053",
      text: "must remain blocked",
      source: "telegram",
      onChunk,
      deliveryKind: "final",
      cancellationReportAuthorization: {
        runId: "run:other",
        finalOutcome: "cancelled",
        receiptRef: "receipt:cancellation:run:other:verified",
      },
    } as Parameters<typeof emitAssistantTextDelivery>[0])

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({ admissionStatus: "cancelled" })
  })

  it("does not let cancellation authorization bypass final LLM review", async () => {
    const onChunk = vi.fn()

    const result = await commitFinalDelivery({
      parentRunId: "run:task053",
      sessionId: "session:task053",
      source: "telegram",
      text: "The requested execution was cancelled.",
      onChunk,
      cancellationReportAuthorization: {
        runId: "run:task053",
        finalOutcome: "cancelled",
        receiptRef: "receipt:cancellation:run:task053:verified",
      },
    })

    expect(result).toMatchObject({
      status: "blocked",
      reasonCodes: ["final_llm_review_receipt_required"],
    })
    expect(onChunk).not.toHaveBeenCalled()
  })
})
