import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, insertOrchestrationEvent } from "../packages/core/src/db/index.js"
import { SqliteTypedObservabilityEventRepository } from "../packages/core/src/db/typed-observability-event-repository.ts"
import { buildTypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"
import { recordTypedObservabilityEventSafely } from "../packages/core/src/observability/typed-event-repository.ts"
import { recordCanonicalTransitionObservability } from "../packages/core/src/observability/canonical-transition-events.ts"
import { projectTypedObservabilityTrace } from "../packages/core/src/observability/typed-event-contract.ts"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import type { CanonicalWorkEvent } from "../packages/core/src/contracts/canonical-work-state.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function event(eventId = "event-task037") {
  const result = buildTypedObservabilityEvent({
    eventId,
    kind: "analysis_completed",
    purpose: "product",
    at: 10,
    correlation: {
      requestId: "request-1",
      requestGroupId: "group-1",
      rootRunId: "run-root",
      runId: "run-root",
      workId: "work-1",
    },
    reasonCode: "solution_selected",
    summary: "Solution selected",
  })
  if (result.status !== "ready") throw new Error(result.reasonCode)
  return result.event
}

function aggregate(events: CanonicalWorkEvent[]): CanonicalWorkAggregate {
  return {
    workId: "work-1",
    rootRunId: "run-root",
    state: "USER_REPORT",
    revision: events.length,
    transitions: events.map((transitionEvent, index) => ({
      revision: index + 1,
      event: transitionEvent,
      previousState: "REQUEST_RECEIVED",
      nextState: "SOLUTION_ANALYZED",
      receiptRef: `receipt-${index + 1}-${transitionEvent.toLowerCase()}`,
    })),
  }
}

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task037-observability-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task037 typed observability repository", () => {
  it("appends idempotently and replays an exact typed event", () => {
    const repository = new SqliteTypedObservabilityEventRepository()

    expect(repository.append(event())).toEqual({ status: "stored", inserted: true, eventId: "event-task037" })
    expect(repository.append(event())).toEqual({ status: "stored", inserted: false, eventId: "event-task037" })
    expect(repository.append({ ...event(), summary: "Different summary" })).toEqual({
      status: "rejected",
      reasonCode: "event_id_conflict",
    })

    const replay = repository.list({ requestId: "request-1", limit: 50 })
    expect(replay.issues).toEqual([])
    expect(replay.events).toEqual([event()])
  })

  it("isolates malformed versioned rows instead of exposing them as events", () => {
    insertOrchestrationEvent({
      id: "event-malformed",
      eventKind: "typed_observability:analysis_completed",
      runId: "run-root",
      requestGroupId: "group-1",
      correlationId: "request-1",
      dedupeKey: "typed-observability:event-malformed",
      source: "typed_observability:v1",
      severity: "info",
      summary: "Malformed event",
      payloadRedacted: { schemaVersion: 999 },
    })

    const replay = new SqliteTypedObservabilityEventRepository().list({ requestId: "request-1" })
    expect(replay.events).toEqual([])
    expect(replay.issues).toEqual([{ code: "schema_version_unsupported", eventId: "event-malformed" }])
  })

  it("contains repository failure and leaves the caller result unchanged", () => {
    const onDegraded = vi.fn()
    const canonicalResult = { status: "applied", revision: 2 } as const
    const receipt = recordTypedObservabilityEventSafely({
      repository: {
        append: () => { throw new Error("db unavailable") },
        list: () => ({ events: [], issues: [] }),
      },
      event: event(),
      onDegraded,
    })

    expect(receipt).toEqual({ status: "degraded", reasonCode: "repository_write_failed" })
    expect(onDegraded).toHaveBeenCalledOnce()
    expect(canonicalResult).toEqual({ status: "applied", revision: 2 })
  })

  it("replays success, changed recovery, and blocked loops from canonical producers", () => {
    const repository = new SqliteTypedObservabilityEventRepository()
    const context = {
      requestId: "request-loop",
      requestGroupId: "group-loop",
      rootRunId: "run-root",
      runId: "run-root",
      at: 0,
    }
    const recoveryEvents: CanonicalWorkEvent[] = [
      "DIAGNOSIS_ACCEPTED",
      "POLICY_ALLOWED",
      "EXECUTION_STARTED",
      "ATTEMPT_RECORDED",
      "RECOVERY_ACCEPTED",
      "POLICY_ALLOWED",
      "EXECUTION_STARTED",
      "ATTEMPT_RECORDED",
      "ALL_CRITERIA_VERIFIED",
      "REPORT_DELIVERED",
    ]

    recoveryEvents.forEach((_, index) => {
      recordCanonicalTransitionObservability({
        repository,
        aggregate: aggregate(recoveryEvents.slice(0, index + 1)),
        context: { ...context, at: index + 1 },
      })
    })

    const replay = repository.list({ requestId: "request-loop" })
    const projection = projectTypedObservabilityTrace(replay.events)
    expect(replay.issues).toEqual([])
    expect(projection.issues).toEqual([])
    expect(projection.terminal).toBe(true)
    expect(projection.events.map((item) => item.kind)).toEqual([
      "analysis_completed",
      "execution_started",
      "evidence_recorded",
      "recovery_completed",
      "execution_started",
      "evidence_recorded",
      "review_completed",
      "finalization_completed",
    ])

    const blockedRepository = new SqliteTypedObservabilityEventRepository()
    const blockedEvents: CanonicalWorkEvent[] = [
      "DIAGNOSIS_ACCEPTED",
      "POLICY_BLOCKED",
      "REPORT_DELIVERED",
    ]
    blockedEvents.forEach((_, index) => {
      recordCanonicalTransitionObservability({
        repository: blockedRepository,
        aggregate: {
          ...aggregate(blockedEvents.slice(0, index + 1)),
          workId: "work-blocked",
        },
        context: {
          ...context,
          requestId: "request-blocked",
          requestGroupId: "group-blocked",
          at: index + 20,
        },
      })
    })
    const blocked = projectTypedObservabilityTrace(
      blockedRepository.list({ requestId: "request-blocked" }).events,
    )
    expect(blocked.issues).toEqual([])
    expect(blocked.terminal).toBe(true)
  })
})
