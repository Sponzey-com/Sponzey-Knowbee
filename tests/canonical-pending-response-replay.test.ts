import { describe, expect, it, vi } from "vitest"
import { replayCanonicalPendingResponses } from "../packages/core/src/runs/canonical-pending-response-replay.ts"
import { buildCanonicalPendingResponseReviewEnvelope } from "../packages/core/src/runs/canonical-pending-response-review.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"

const rawText = "review input"
const responseText = "rendered final response"

const pending = {
  runId: "run-1",
  workId: "work:root:run-1",
  sessionId: "session-1",
  source: "webui",
  text: responseText,
  textSource: "llm_generated" as const,
  finalOutcome: "succeeded" as const,
  textFingerprint: `sha256:${"a".repeat(64)}` as const,
  status: "pending" as const,
  createdAt: 1,
  updatedAt: 1,
  reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope({
    rawText,
    rawTextSource: "llm_generated",
    contentKind: "final_report",
    expectedLanguage: "en",
    receipt: buildLlmResponseReviewReceipt({
      rawText,
      responseText,
      rawTextSource: "llm_generated",
      contentKind: "final_report",
    }),
  }),
}

describe("canonical pending response replay", () => {
  it("replays once, records canonical delivery, then consumes the outbox item", async () => {
    const order: string[] = []
    const result = await replayCanonicalPendingResponses({
      listPending: () => [pending],
      loadAggregate: () => ({ workId: pending.workId, rootRunId: pending.runId, state: "SUCCEEDED", revision: 5, transitions: [] }),
      findCommittedDelivery: () => undefined,
      commitDelivery: vi.fn(async () => {
        order.push("deliver")
        return { status: "delivered", deliveryKey: "key", idempotencyKey: "idem", text: pending.text, attributions: [], reasonCodes: [] }
      }),
      recordCanonicalDelivery: vi.fn(async () => {
        order.push("transition")
        return { ok: true as const }
      }),
      consume: vi.fn(() => {
        order.push("consume")
        return { consumed: true as const }
      }),
    })
    expect(result).toEqual([{ runId: "run-1", status: "recovered", reasonCode: "canonical_replay_delivery_recovered" }])
    expect(order).toEqual(["deliver", "transition", "consume"])
  })

  it("does not resend an already committed delivery", async () => {
    const commitDelivery = vi.fn()
    await replayCanonicalPendingResponses({
      listPending: () => [pending],
      loadAggregate: () => ({ workId: pending.workId, rootRunId: pending.runId, state: "SUCCEEDED", revision: 5, transitions: [] }),
      findCommittedDelivery: () => ({ status: "duplicate_suppressed", deliveryKey: "key", idempotencyKey: "idem", text: pending.text, attributions: [], reasonCodes: [], existingEventId: "event-1" }),
      commitDelivery,
      recordCanonicalDelivery: async () => ({ ok: true }),
      consume: () => ({ consumed: true }),
    })
    expect(commitDelivery).not.toHaveBeenCalled()
  })

  it("keeps an unreviewed pending response without delivery or consumption", async () => {
    const commitDelivery = vi.fn()
    const consume = vi.fn()
    const result = await replayCanonicalPendingResponses({
      listPending: () => [{
        ...pending,
        reviewEnvelope: undefined,
        reviewIssue: "review_envelope_missing" as const,
      }],
      loadAggregate: () => ({
        workId: pending.workId,
        rootRunId: pending.runId,
        state: "SUCCEEDED",
        revision: 5,
        transitions: [],
      }),
      findCommittedDelivery: () => undefined,
      commitDelivery,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      consume,
    })

    expect(result).toEqual([{
      runId: pending.runId,
      status: "failed",
      reasonCode: "review_envelope_missing",
    }])
    expect(commitDelivery).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
  })

  it("does not replay a partial response without its terminal report fingerprint", async () => {
    const commitDelivery = vi.fn()
    const consume = vi.fn()
    const result = await replayCanonicalPendingResponses({
      listPending: () => [{ ...pending, finalOutcome: "partial" as const }],
      loadAggregate: () => ({
        workId: pending.workId,
        rootRunId: pending.runId,
        state: "PARTIALLY_SUCCEEDED",
        revision: 5,
        transitions: [],
      }),
      findCommittedDelivery: () => undefined,
      commitDelivery,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      consume,
    })

    expect(result).toEqual([{
      runId: pending.runId,
      status: "failed",
      reasonCode: "review_envelope_terminal_report_missing",
    }])
    expect(commitDelivery).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
  })
})
