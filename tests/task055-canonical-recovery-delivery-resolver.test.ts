import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyCanonicalWorkEvent } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { SqliteCanonicalPendingResponseRepository } from "../packages/core/src/db/canonical-pending-response-repository.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { insertSession } from "../packages/core/src/db/index.js"
import { recoverCanonicalPendingResponsesOnStartup } from "../packages/core/src/runs/canonical-pending-response-recovery-runtime.ts"
import { replayCanonicalPendingResponses } from "../packages/core/src/runs/canonical-pending-response-replay.ts"
import { buildCanonicalPendingResponseReviewEnvelope } from "../packages/core/src/runs/canonical-pending-response-review.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

function reviewedEnvelope(rawText: string, responseText: string) {
  return buildCanonicalPendingResponseReviewEnvelope({
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
  })
}

describe("Task 055 canonical recovery delivery resolver", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task055-recovery-resolver-")
  })

  afterEach(() => runtime.dispose())

  it("recovers an external pending response through an explicitly resolved handler", async () => {
    const runId = "run:task055:telegram"
    const sessionId = "session:task055:telegram"
    const workId = `work:root:${runId}`
    const responseText = "recovered Telegram response"
    insertSession({
      id: sessionId,
      source: "telegram",
      source_id: "telegram:5500:main",
      created_at: 1,
      updated_at: 1,
      summary: "task055",
    })
    createRootRun({
      id: runId,
      sessionId,
      requestGroupId: "group:task055:telegram",
      prompt: "recover through channel runtime",
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
      reviewEnvelope: reviewedEnvelope("task055 review input", responseText),
    })
    const resolveDeliveryHandler = vi.fn(() =>
      vi.fn(async (chunk: { type: string }) =>
        chunk.type === "done"
          ? {
              textDeliveries: [
                {
                  channel: "telegram" as const,
                  text: responseText,
                  messageIds: [55],
                  deliveryReceipts: [
                    {
                      channelId: "telegram:primary",
                      provider: "telegram",
                      connectionId: "telegram:primary",
                      target: { roomId: "5500" },
                      status: "sent" as const,
                      timestamp: 55,
                      idempotencyKey: "telegram:task055:recovery",
                      messageId: "55",
                    },
                  ],
                },
              ],
            }
          : undefined,
      ),
    )

    const result = await recoverCanonicalPendingResponsesOnStartup({
      resolveDeliveryHandler,
    })

    expect(resolveDeliveryHandler).toHaveBeenCalledWith({
      runId,
      sessionId,
      source: "telegram",
      language: "en",
    })
    expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 })
    expect(pendingRepository.load(runId)?.status).toBe("consumed")
    expect(workRepository.load(workId)?.state).toBe("USER_REPORT")
  })
})

describe("Task 055 replay item isolation", () => {
  it("continues with the next pending response when one delivery resolver throws", async () => {
    const items = ["first", "second"].map((suffix) => ({
      runId: `run:task055:${suffix}`,
      workId: `work:root:run:task055:${suffix}`,
      sessionId: `session:task055:${suffix}`,
      source: "telegram",
      text: `response ${suffix}`,
      textSource: "llm_reviewed" as const,
      finalOutcome: "succeeded" as const,
      textFingerprint:
        `sha256:${(suffix === "first" ? "a" : "b").repeat(64)}` as `sha256:${string}`,
      status: "pending" as const,
      createdAt: 1,
      updatedAt: 1,
      reviewEnvelope: reviewedEnvelope(`review ${suffix}`, `response ${suffix}`),
    }))
    const consumed: string[] = []

    const result = await replayCanonicalPendingResponses({
      listPending: () => items,
      loadAggregate: (workId) => ({
        workId,
        rootRunId: workId.replace("work:root:", ""),
        state: "SUCCEEDED",
        revision: 5,
        transitions: [],
      }),
      findCommittedDelivery: () => undefined,
      commitDelivery: async (item) => {
        if (item.runId.endsWith(":first")) throw new Error("resolver must stay private")
        return {
          status: "delivered" as const,
          deliveryKey: "delivery:second",
          idempotencyKey: "idempotency:second",
          text: item.text,
          attributions: [],
          reasonCodes: [],
        }
      },
      recordCanonicalDelivery: async () => ({ ok: true }),
      consume: (runId) => {
        consumed.push(runId)
        return { consumed: true }
      },
    })

    expect(result).toEqual([
      {
        runId: "run:task055:first",
        status: "failed",
        reasonCode: "canonical_replay_delivery_exception",
      },
      {
        runId: "run:task055:second",
        status: "recovered",
        reasonCode: "canonical_replay_delivery_recovered",
      },
    ])
    expect(consumed).toEqual(["run:task055:second"])
  })
})
