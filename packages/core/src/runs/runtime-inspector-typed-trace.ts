import { projectTypedObservabilityTrace } from "../observability/typed-event-contract.js"
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js"

export type RuntimeInspectorTypedTraceStage =
  | "not_started"
  | "request"
  | "analysis"
  | "execution"
  | "evidence"
  | "review"
  | "recovery"
  | "finalization"
  | "unknown"

export interface RuntimeInspectorTypedTraceProjection {
  status: "ready" | "not_recorded" | "unavailable"
  currentStage: RuntimeInspectorTypedTraceStage
  eventCount: number
  terminal: boolean
  issueCount: number
  verification: "not_started" | "evidence_recorded" | "reviewed" | "unknown"
  recoveryCount: number
  blocker: "none" | "policy" | "exhausted" | "cancelled" | "unknown"
}

const STAGE_BY_KIND = {
  request_received: "request",
  analysis_started: "analysis",
  analysis_completed: "analysis",
  execution_started: "execution",
  execution_completed: "execution",
  evidence_recorded: "evidence",
  review_completed: "review",
  recovery_started: "recovery",
  recovery_completed: "recovery",
  finalization_completed: "finalization",
} as const

export function buildRuntimeInspectorTypedTrace(input: {
  repository: TypedObservabilityEventRepository
  run: {
    id: string
    requestGroupId: string
    lineageRootRunId: string
  }
}): RuntimeInspectorTypedTraceProjection {
  try {
    const snapshot = input.repository.list({
      requestId: input.run.id,
      requestGroupId: input.run.requestGroupId,
      rootRunId: input.run.lineageRootRunId,
      runId: input.run.id,
      limit: 500,
    })
    if (snapshot.events.length === 0) {
      return snapshot.issues.length > 0
        ? {
            status: "unavailable",
            currentStage: "unknown",
            eventCount: 0,
            terminal: false,
            issueCount: snapshot.issues.length,
            verification: "unknown",
            recoveryCount: 0,
            blocker: "unknown",
          }
        : {
            status: "not_recorded",
            currentStage: "not_started",
            eventCount: 0,
            terminal: false,
            issueCount: 0,
            verification: "not_started",
            recoveryCount: 0,
            blocker: "none",
          }
    }

    const trace = projectTypedObservabilityTrace(snapshot.events)
    const last = trace.events.at(-1)
    const hasReview = trace.events.some((event) => event.kind === "review_completed" || event.kind === "finalization_completed")
    const hasEvidence = trace.events.some((event) => event.kind === "evidence_recorded")
    const recoveryCount = trace.events.filter((event) => event.kind === "recovery_completed").length
    const blocker = trace.events.some((event) => event.reasonCode === "policy_blocked")
      ? "policy"
      : trace.events.some((event) => event.reasonCode === "paths_exhausted")
        ? "exhausted"
        : trace.events.some((event) => event.reasonCode === "user_cancelled")
          ? "cancelled"
          : "none"

    return {
      status: "ready",
      currentStage: last ? STAGE_BY_KIND[last.kind] : "unknown",
      eventCount: trace.events.length,
      terminal: trace.terminal,
      issueCount: snapshot.issues.length + trace.issues.length,
      verification: hasReview ? "reviewed" : hasEvidence ? "evidence_recorded" : "not_started",
      recoveryCount,
      blocker,
    }
  } catch {
    return {
      status: "unavailable",
      currentStage: "unknown",
      eventCount: 0,
      terminal: false,
      issueCount: 1,
      verification: "unknown",
      recoveryCount: 0,
      blocker: "unknown",
    }
  }
}
