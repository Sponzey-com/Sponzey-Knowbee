import { describe, expect, it } from "vitest"
import {
  buildRuntimeInspectorTypedTrace,
} from "../packages/core/src/runs/runtime-inspector-typed-trace.ts"
import { buildTypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"

function typedEvent(input: {
  eventId: string
  kind: Parameters<typeof buildTypedObservabilityEvent>[0]["kind"]
  at: number
  reasonCode: string
  attemptId?: string
  evidenceId?: string
  reviewId?: string
  recoveryId?: string
}) {
  const built = buildTypedObservabilityEvent({
    eventId: input.eventId,
    kind: input.kind,
    purpose: input.kind.includes("execution") || input.kind.includes("recovery") ? "field_debug" : "product",
    at: input.at,
    correlation: {
      requestId: "run-1",
      requestGroupId: "group-1",
      rootRunId: "run-1",
      runId: "run-1",
      workId: "work-1",
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
      ...(input.reviewId ? { reviewId: input.reviewId } : {}),
      ...(input.recoveryId ? { recoveryId: input.recoveryId } : {}),
    },
    reasonCode: input.reasonCode,
    summary: "Bounded trace status",
  })
  if (built.status !== "ready") throw new Error(built.reasonCode)
  return built.event
}

describe("task038 runtime inspector typed trace", () => {
  it("returns bounded empty and unavailable states without throwing", () => {
    expect(buildRuntimeInspectorTypedTrace({
      repository: { append: () => ({ status: "stored", inserted: true, eventId: "unused" }), list: () => ({ events: [], issues: [] }) },
      run: { id: "run-1", requestGroupId: "group-1", lineageRootRunId: "run-1" },
    })).toEqual({
      status: "not_recorded",
      currentStage: "not_started",
      eventCount: 0,
      terminal: false,
      issueCount: 0,
      verification: "not_started",
      recoveryCount: 0,
      blocker: "none",
    })

    expect(buildRuntimeInspectorTypedTrace({
      repository: { append: () => ({ status: "stored", inserted: true, eventId: "unused" }), list: () => { throw new Error("db unavailable") } },
      run: { id: "run-1", requestGroupId: "group-1", lineageRootRunId: "run-1" },
    })).toEqual({
      status: "unavailable",
      currentStage: "unknown",
      eventCount: 0,
      terminal: false,
      issueCount: 1,
      verification: "unknown",
      recoveryCount: 0,
      blocker: "unknown",
    })
  })

  it("projects recovery and blocked facts without exposing IDs or reason codes", () => {
    const events = [
      typedEvent({ eventId: "analysis", kind: "analysis_completed", at: 1, reasonCode: "diagnosis_accepted" }),
      typedEvent({ eventId: "execute", kind: "execution_started", at: 2, reasonCode: "execution_started", attemptId: "attempt-1" }),
      typedEvent({ eventId: "evidence", kind: "evidence_recorded", at: 3, reasonCode: "attempt_evidence_recorded", attemptId: "attempt-1", evidenceId: "evidence-1" }),
      typedEvent({ eventId: "recovery", kind: "recovery_completed", at: 4, reasonCode: "recovery_accepted", attemptId: "attempt-1", recoveryId: "recovery-1" }),
      typedEvent({ eventId: "blocked", kind: "review_completed", at: 5, reasonCode: "policy_blocked", reviewId: "review-1", evidenceId: "evidence-1" }),
    ]
    const projection = buildRuntimeInspectorTypedTrace({
      repository: { append: () => ({ status: "stored", inserted: true, eventId: "unused" }), list: () => ({ events, issues: [] }) },
      run: { id: "run-1", requestGroupId: "group-1", lineageRootRunId: "run-1" },
    })

    expect(projection).toEqual({
      status: "ready",
      currentStage: "review",
      eventCount: 5,
      terminal: false,
      issueCount: 0,
      verification: "reviewed",
      recoveryCount: 1,
      blocker: "policy",
    })
    expect(JSON.stringify(projection)).not.toMatch(/attempt-1|evidence-1|review-1|policy_blocked/)
  })
})
