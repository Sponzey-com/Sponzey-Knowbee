import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalPendingResponse } from "../contracts/canonical-pending-response.js"
import {
  buildCanonicalDeliveryDescriptor,
  type CanonicalFinalizationTransitionDescriptor,
} from "./canonical-finalization-lifecycle.js"
import type { FinalDeliveryCommitResult } from "./channel-finalizer.js"

export interface CanonicalPendingResponseReplayResult {
  runId: string
  status: "recovered" | "skipped" | "failed"
  reasonCode: string
}

export async function replayCanonicalPendingResponses(dependencies: {
  listPending: () => CanonicalPendingResponse[]
  loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined
  findCommittedDelivery: (item: CanonicalPendingResponse) => FinalDeliveryCommitResult | undefined
  commitDelivery: (item: CanonicalPendingResponse) => Promise<FinalDeliveryCommitResult>
  recordCanonicalDelivery: (
    descriptor: CanonicalFinalizationTransitionDescriptor,
  ) => Promise<{ ok: true } | { ok: false; reasonCode: string }>
  consume: (runId: string) => { consumed: true } | { consumed: false; reasonCode: string }
}): Promise<CanonicalPendingResponseReplayResult[]> {
  const results: CanonicalPendingResponseReplayResult[] = []
  for (const item of dependencies.listPending()) {
    const aggregate = dependencies.loadAggregate(item.workId)
    if (!aggregate || aggregate.rootRunId !== item.runId) {
      results.push({ runId: item.runId, status: "failed", reasonCode: "canonical_replay_aggregate_mismatch" })
      continue
    }
    if (aggregate.state === "USER_REPORT") {
      dependencies.consume(item.runId)
      results.push({ runId: item.runId, status: "skipped", reasonCode: "canonical_replay_already_reported" })
      continue
    }
    if (!["SUCCEEDED", "PARTIALLY_SUCCEEDED", "BLOCKED", "EXHAUSTED", "CANCELLED"].includes(aggregate.state)) {
      results.push({ runId: item.runId, status: "failed", reasonCode: "canonical_replay_state_not_deliverable" })
      continue
    }

    const committedDelivery = dependencies.findCommittedDelivery(item)
    if (!committedDelivery && !item.reviewEnvelope) {
      results.push({
        runId: item.runId,
        status: "failed",
        reasonCode: item.reviewIssue ?? "review_envelope_missing",
      })
      continue
    }
    if (
      !committedDelivery
      && ["partial", "blocked", "exhausted"].includes(item.finalOutcome)
      && !item.reviewEnvelope?.terminalReportFingerprint
    ) {
      results.push({
        runId: item.runId,
        status: "failed",
        reasonCode: "review_envelope_terminal_report_missing",
      })
      continue
    }
    let delivery: FinalDeliveryCommitResult
    try {
      delivery = committedDelivery ?? await dependencies.commitDelivery(item)
    } catch {
      results.push({
        runId: item.runId,
        status: "failed",
        reasonCode: "canonical_replay_delivery_exception",
      })
      continue
    }
    const built = buildCanonicalDeliveryDescriptor({
      runId: item.runId,
      source: item.source,
      sessionId: item.sessionId,
      text: item.text,
      textSource: item.textSource,
      finalOutcome: item.finalOutcome,
      delivery,
    })
    if (!built.ok) {
      results.push({ runId: item.runId, status: "failed", reasonCode: built.reasonCode })
      continue
    }
    const recorded = await dependencies.recordCanonicalDelivery(built.descriptor)
    if (!recorded.ok) {
      results.push({ runId: item.runId, status: "failed", reasonCode: recorded.reasonCode })
      continue
    }
    const consumed = dependencies.consume(item.runId)
    results.push(consumed.consumed
      ? { runId: item.runId, status: "recovered", reasonCode: "canonical_replay_delivery_recovered" }
      : { runId: item.runId, status: "failed", reasonCode: consumed.reasonCode })
  }
  return results
}
