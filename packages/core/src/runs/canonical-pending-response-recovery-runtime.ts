import { getDb } from "../db/index.js"
import { SqliteCanonicalPendingResponseRepository } from "../db/canonical-pending-response-repository.js"
import { SqliteCanonicalWorkReceiptRepository } from "../db/canonical-work-receipt-repository.js"
import { SqliteCanonicalWorkRepository } from "../db/canonical-work-repository.js"
import { commitFinalDelivery, findCommittedFinalDelivery } from "./channel-finalizer.js"
import { recordCanonicalFinalizationTransition } from "./canonical-finalization-lifecycle.js"
import { replayCanonicalPendingResponses } from "./canonical-pending-response-replay.js"
import type { RunChunkDeliveryHandler } from "./delivery.js"
import { appendRunEvent, applyCanonicalRunTransition } from "./store.js"

export interface CanonicalPendingDeliveryHandlerResolutionInput {
  runId: string
  sessionId: string
  source: string
  language?: "ko" | "en"
}

export type CanonicalPendingDeliveryHandlerResolver = (
  input: CanonicalPendingDeliveryHandlerResolutionInput,
) => RunChunkDeliveryHandler

export async function recoverCanonicalPendingResponsesOnStartup(options: {
  resolveDeliveryHandler?: CanonicalPendingDeliveryHandlerResolver
} = {}): Promise<{
  recovered: number
  failed: number
  skipped: number
}> {
  const database = getDb()
  const pendingRepository = new SqliteCanonicalPendingResponseRepository(database, () => Date.now())
  const workRepository = new SqliteCanonicalWorkRepository(database, () => Date.now())
  const receiptRepository = new SqliteCanonicalWorkReceiptRepository(database, () => Date.now())
  const results = await replayCanonicalPendingResponses({
    listPending: () => pendingRepository.listPending(1_000),
    loadAggregate: (workId) => workRepository.load(workId),
    findCommittedDelivery: (item) => {
      const existing = findCommittedFinalDelivery(item.runId, {
        source: item.source,
        sessionId: item.sessionId,
      })
      if (!existing?.delivery_key || !existing.idempotency_key) return undefined
      return {
        status: "duplicate_suppressed",
        deliveryKey: existing.delivery_key,
        idempotencyKey: existing.idempotency_key,
        existingEventId: existing.id,
        text: item.text,
        attributions: [],
        reasonCodes: [],
      }
    },
    commitDelivery: (item) => {
      const onChunk = options.resolveDeliveryHandler?.({
        runId: item.runId,
        sessionId: item.sessionId,
        source: item.source,
        ...(item.reviewEnvelope?.expectedLanguage === "ko" ||
        item.reviewEnvelope?.expectedLanguage === "en"
          ? { language: item.reviewEnvelope.expectedLanguage }
          : {}),
      })
      const cancellationReceipt = item.finalOutcome === "cancelled"
        ? receiptRepository.findLatestConsumedByKind(item.workId, "cancellation")
        : undefined
      return item.reviewEnvelope
        ? commitFinalDelivery({
          parentRunId: item.runId,
          sessionId: item.sessionId,
          source: item.source,
          text: item.text,
          onChunk,
          responseReview: {
            rawTextSha256: item.reviewEnvelope.rawTextSha256,
            rawTextSource: item.reviewEnvelope.rawTextSource,
            contentKind: item.reviewEnvelope.contentKind,
            expectedLanguage: item.reviewEnvelope.expectedLanguage,
            receipt: item.reviewEnvelope.receipt,
          },
          ...(cancellationReceipt
            ? {
                cancellationReportAuthorization: {
                  runId: item.runId,
                  finalOutcome: "cancelled" as const,
                  receiptRef: cancellationReceipt.receiptId,
                },
              }
            : {}),
        })
        : Promise.resolve({
          status: "blocked" as const,
          deliveryKey: `canonical-replay-blocked:${item.runId}`,
          idempotencyKey: `canonical-replay-blocked:${item.runId}`,
          text: item.text,
          attributions: [],
          reasonCodes: [item.reviewIssue ?? "review_envelope_missing"],
        })
    },
    recordCanonicalDelivery: async (descriptor) => {
      const aggregate = workRepository.load(descriptor.workId)
      if (!aggregate) return { ok: false, reasonCode: "canonical_replay_aggregate_not_found" }
      return recordCanonicalFinalizationTransition(descriptor, {
        issueReceipt: (receipt) => receiptRepository.issue(receipt),
        loadReceipt: (receiptId) => receiptRepository.load(receiptId),
        applyTransition: ({ runId, workId, event, receiptRef, finalOutcome }) =>
          applyCanonicalRunTransition({
            runId,
            workId,
            expectedRevision: aggregate.revision,
            event,
            receiptRef,
            ...(finalOutcome ? { finalOutcome } : {}),
          }),
      })
    },
    consume: (runId) => pendingRepository.markConsumed(runId),
  })

  for (const result of results) {
    appendRunEvent(result.runId, `${result.reasonCode}:${result.status}`)
  }
  return {
    recovered: results.filter((result) => result.status === "recovered").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  }
}
