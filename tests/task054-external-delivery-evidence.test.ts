import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DeliveryReceipt } from "../packages/core/src/channels/contracts.ts"
import { applyCanonicalWorkEvent } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { SqliteCanonicalPendingResponseRepository } from "../packages/core/src/db/canonical-pending-response-repository.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { insertSession, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { recoverCanonicalPendingResponsesOnStartup } from "../packages/core/src/runs/canonical-pending-response-recovery-runtime.ts"
import { buildCanonicalPendingResponseReviewEnvelope } from "../packages/core/src/runs/canonical-pending-response-review.ts"
import { emitAssistantTextDelivery } from "../packages/core/src/runs/delivery.ts"
import {
  buildTextDeliveryKey,
  recordMessageLedgerEvent,
} from "../packages/core/src/runs/message-ledger.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

function providerReceipt(
  provider: string,
  status: DeliveryReceipt["status"] = "sent",
): DeliveryReceipt {
  return {
    channelId: `${provider}:primary`,
    provider,
    connectionId: `${provider}:primary`,
    target: { roomId: "room:task054" },
    status,
    timestamp: 1,
    idempotencyKey: `${provider}:task054:final`,
    messageId: "message:task054",
  }
}

describe("Task 054 external delivery evidence", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task054-delivery-")
    for (const [suffix, source] of [
      ["no-handler", "telegram"],
      ["undefined", "telegram"],
      ["receipt", "telegram"],
      ["legacy-delivered", "telegram"],
      ["slack:sent", "telegram"],
      ["telegram:accepted", "telegram"],
      ["telegram:failed", "telegram"],
      ["telegram:partial", "telegram"],
      ["webui", "webui"],
    ] as const) {
      const runId = `run:task054:${suffix}`
      const sessionId = `session:task054:${suffix}`
      insertSession({
        id: sessionId,
        source,
        source_id: null,
        created_at: 1,
        updated_at: 1,
        summary: "task054",
      })
      createRootRun({
        id: runId,
        sessionId,
        requestGroupId: `group:task054:${suffix}`,
        prompt: "verify delivery evidence",
        source,
      })
    }
  })

  afterEach(() => runtime.dispose())

  it("does not claim external delivery when no channel handler exists", async () => {
    const result = await emitAssistantTextDelivery({
      runId: "run:task054:no-handler",
      sessionId: "session:task054:no-handler",
      text: "external final answer",
      source: "telegram",
      onChunk: undefined,
      force: true,
    })

    expect(result).toMatchObject({ textDelivered: false, doneDelivered: false })
  })

  it("does not treat an undefined external handler result as delivery evidence", async () => {
    const result = await emitAssistantTextDelivery({
      runId: "run:task054:undefined",
      sessionId: "session:task054:undefined",
      text: "external final answer",
      source: "telegram",
      onChunk: vi.fn().mockResolvedValue(undefined),
      force: true,
    })

    expect(result).toMatchObject({ textDelivered: false, doneDelivered: false })
  })

  it("accepts matching provider evidence returned by the done chunk", async () => {
    const text = "externally delivered answer"
    const result = await emitAssistantTextDelivery({
      runId: "run:task054:receipt",
      sessionId: "session:task054:receipt",
      text,
      source: "telegram",
      onChunk: vi.fn(async (chunk) =>
        chunk.type === "done"
          ? {
              textDeliveries: [
                {
                  channel: "telegram" as const,
                  text,
                  messageIds: [1],
                  deliveryReceipts: [providerReceipt("telegram")],
                },
              ],
            }
          : undefined,
      ),
      force: true,
    })

    expect(result).toMatchObject({ textDelivered: true, doneDelivered: true })
  })

  it("does not trust a legacy external delivered event without provider evidence", async () => {
    const runId = "run:task054:legacy-delivered"
    const sessionId = "session:task054:legacy-delivered"
    const text = "legacy unverified answer"
    const deliveryKey = buildTextDeliveryKey("telegram", sessionId, text)
    const idempotencyKey = `text-delivery:${runId}:telegram:${deliveryKey}`
    recordMessageLedgerEvent({
      runId,
      sessionKey: sessionId,
      channel: "telegram",
      eventKind: "text_delivered",
      deliveryKind: "final",
      deliveryKey,
      idempotencyKey,
      status: "delivered",
      summary: "legacy delivery without evidence",
    })
    const onChunk = vi.fn()

    const result = await emitAssistantTextDelivery({
      runId,
      sessionId,
      text,
      source: "telegram",
      onChunk,
      deliveryKind: "final",
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      textDelivered: false,
      doneDelivered: false,
      admissionStatus: "in_flight_unknown",
    })
  })

  it.each([
    ["another provider", providerReceipt("slack")],
    ["accepted-only status", providerReceipt("telegram", "accepted")],
    ["failed status", providerReceipt("telegram", "failed")],
    ["partial status", providerReceipt("telegram", "partial")],
  ])("rejects %s as external success evidence", async (_label, receipt) => {
    const text = "must remain unconfirmed"
    const result = await emitAssistantTextDelivery({
      runId: `run:task054:${receipt.provider}:${receipt.status}`,
      sessionId: `session:task054:${receipt.provider}:${receipt.status}`,
      text,
      source: "telegram",
      onChunk: vi.fn(async (chunk) =>
        chunk.type === "done"
          ? {
              textDeliveries: [
                {
                  channel: "telegram" as const,
                  text,
                  deliveryReceipts: [receipt],
                },
              ],
            }
          : undefined,
      ),
      force: true,
    })

    expect(result).toMatchObject({ textDelivered: false, doneDelivered: false })
  })

  it("preserves internal WebUI delivery without provider receipts", async () => {
    const result = await emitAssistantTextDelivery({
      runId: "run:task054:webui",
      sessionId: "session:task054:webui",
      text: "internal final answer",
      source: "webui",
      onChunk: undefined,
      force: true,
    })

    expect(result).toMatchObject({ textDelivered: true, doneDelivered: true })
  })
})

describe("Task 054 external pending response recovery", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task054-recovery-")
  })

  afterEach(() => runtime.dispose())

  it("keeps an external response pending when startup has no provider handler", async () => {
    const runId = "run:task054:recovery"
    const sessionId = "session:task054:recovery"
    const workId = `work:root:${runId}`
    insertSession({
      id: sessionId,
      source: "telegram",
      source_id: "chat:task054",
      created_at: 1,
      updated_at: 1,
      summary: "task054",
    })
    createRootRun({
      id: runId,
      sessionId,
      requestGroupId: "group:task054:recovery",
      prompt: "recover external answer",
      source: "telegram",
    })
    const workRepository = new SqliteCanonicalWorkRepository(runtime.db, () => Date.now())
    let aggregate = workRepository.load(workId)
    if (!aggregate) throw new Error("canonical aggregate expected")
    for (const [event, receiptRef] of [
      ["DIAGNOSIS_ACCEPTED", "fixture:diagnosis"],
      ["POLICY_ALLOWED", "fixture:policy"],
      ["EXECUTION_STARTED", "fixture:execution"],
      ["ATTEMPT_RECORDED", "fixture:attempt"],
      ["ALL_CRITERIA_VERIFIED", "fixture:verification"],
    ] as const) {
      const applied = applyCanonicalWorkEvent({
        aggregate,
        expectedRevision: aggregate.revision,
        event,
        receiptRef,
      })
      if (!applied.applied) throw new Error("canonical transition fixture failed")
      expect(
        workRepository.save({
          aggregate: applied.aggregate,
          expectedRevision: aggregate.revision,
        }),
      ).toEqual({ saved: true })
      aggregate = applied.aggregate
    }
    const rawText = "external recovery review input"
    const responseText = "external recovery final answer"
    const pendingRepository = new SqliteCanonicalPendingResponseRepository(runtime.db, () =>
      Date.now(),
    )
    pendingRepository.stage({
      runId,
      workId,
      sessionId,
      source: "telegram",
      text: responseText,
      textSource: "llm_reviewed",
      finalOutcome: "succeeded",
      reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope({
        rawText,
        rawTextSource: "llm_reviewed",
        contentKind: "final_report",
        expectedLanguage: "en",
        receipt: buildLlmResponseReviewReceipt({
          rawText,
          responseText,
          rawTextSource: "llm_reviewed",
          contentKind: "final_report",
        }),
      }),
    })

    const result = await recoverCanonicalPendingResponsesOnStartup()

    expect(result).toEqual({ recovered: 0, failed: 1, skipped: 0 })
    expect(pendingRepository.loadPending(runId)).toBeDefined()
    expect(workRepository.load(workId)?.state).toBe("SUCCEEDED")
    expect(listMessageLedgerEvents({ runId, limit: 100 })).not.toContainEqual(
      expect.objectContaining({ event_kind: "final_answer_delivered" }),
    )
  })
})
