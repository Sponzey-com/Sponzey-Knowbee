import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { insertSession, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { commitFinalDelivery } from "../packages/core/src/runs/channel-finalizer.ts"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import {
  cancelRootRun,
  createRootRun,
  getRootRun,
  setRunStepStatus,
} from "../packages/core/src/runs/store.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture("knowbee-task052-cancel-delivery-")
  insertSession({
    id: "session:task052",
    source: "telegram",
    source_id: "chat:task052",
    created_at: 1,
    updated_at: 1,
    summary: "task052",
  })
  createRootRun({
    id: "run:task052",
    sessionId: "session:task052",
    requestGroupId: "group:task052",
    prompt: "cancel before delivery",
    source: "telegram",
  })
})

afterEach(() => runtime.dispose())

describe("Task 052 final delivery cancellation admission", () => {
  it("does not invoke the channel handler for a durably cancelled root run", async () => {
    cancelRootRun("run:task052")
    const onChunk = vi.fn()

    const result = await emitAssistantTextDelivery({
      runId: "run:task052",
      sessionId: "session:task052",
      text: "must not be sent",
      source: "telegram",
      onChunk,
      deliveryKind: "final",
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "cancelled",
    })
  })

  it("closes admission when cancellation wins the post-reservation race", async () => {
    let checks = 0
    const onChunk = vi.fn()
    const input = {
      runId: "run:task052",
      sessionId: "session:task052",
      text: "race-sensitive final answer",
      source: "telegram" as const,
      onChunk,
      deliveryKind: "final" as const,
      isCancelled: () => {
        checks += 1
        return checks >= 2
      },
    }

    const result = await emitAssistantTextDelivery(input)

    expect(checks).toBeGreaterThanOrEqual(2)
    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "cancelled",
    })
  })

  it("rechecks cancellation inside the provider queue before invoking the handler", async () => {
    let checks = 0
    const onChunk = vi.fn()

    const result = await emitAssistantTextDelivery({
      runId: "run:task052",
      sessionId: "session:task052",
      text: "provider-queue-sensitive answer",
      source: "telegram",
      onChunk,
      deliveryKind: "final",
      isCancelled: () => {
        checks += 1
        return checks >= 4
      },
    })

    expect(checks).toBeGreaterThanOrEqual(4)
    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "cancelled",
    })
  })

  it("does not let a cancelled finalizer record committed delivery", async () => {
    cancelRootRun("run:task052")
    const text = "cancelled finalizer answer"
    const rawText = `review:${text}`
    const onChunk = vi.fn()

    const result = await commitFinalDelivery({
      parentRunId: "run:task052",
      sessionId: "session:task052",
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
      reasonCodes: ["delivery_admission_cancelled"],
    })
    expect(onChunk).not.toHaveBeenCalled()
    expect(
      listMessageLedgerEvents({ runId: "run:task052", limit: 100 }).some(
        (event) => event.event_kind === "final_answer_delivered",
      ),
    ).toBe(false)
  })

  it("keeps terminal steps completed when cancellation arrives after committed delivery", async () => {
    const text = "already delivered final answer"
    const rawText = `review:${text}`
    const onChunk = vi.fn(async (chunk: { type: string }) =>
      chunk.type === "done"
        ? {
            textDeliveries: [
              {
                channel: "telegram" as const,
                text,
                messageIds: [52],
                deliveryReceipts: [
                  {
                    channelId: "telegram:primary",
                    provider: "telegram",
                    connectionId: "telegram:primary",
                    target: { roomId: "chat:task052" },
                    status: "sent" as const,
                    timestamp: 52,
                    idempotencyKey: "telegram:task052:late-cancel",
                    messageId: "52",
                  },
                ],
              },
            ],
          }
        : undefined,
    )

    const delivery = await commitFinalDelivery({
      parentRunId: "run:task052",
      sessionId: "session:task052",
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
    expect(delivery.status).toBe("delivered")
    setRunStepStatus("run:task052", "reviewing", "running", "결과를 검토하고 있습니다.")

    const run = cancelRootRun("run:task052")

    expect(run?.status).toBe("completed")
    expect(run?.currentStepKey).toBe("completed")
    expect(run?.steps.find((step) => step.key === "reviewing")?.status).toBe("completed")
    expect(run?.steps.find((step) => step.key === "finalizing")?.status).toBe("completed")
    expect(run?.steps.find((step) => step.key === "completed")?.status).toBe("completed")
    expect(getRootRun("run:task052")?.status).toBe("completed")
  })
})
