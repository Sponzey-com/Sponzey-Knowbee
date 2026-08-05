import { describe, expect, it, vi } from "vitest"
import {
  buildTypedObservabilityEvent,
  projectTypedObservabilityTrace,
} from "../packages/core/src/observability/typed-event-contract.ts"
import { writeTypedObservabilityLog } from "../packages/core/src/observability/typed-event-logger.ts"

const baseCorrelation = {
  requestId: "request-1",
  requestGroupId: "group-1",
  rootRunId: "run-root",
  runId: "run-root",
  workId: "work-1",
}

function ready(input: Parameters<typeof buildTypedObservabilityEvent>[0]) {
  const result = buildTypedObservabilityEvent(input)
  expect(result.status).toBe("ready")
  if (result.status !== "ready") throw new Error(result.reasonCode)
  return result.event
}

describe("task036 typed observability contract", () => {
  it("rejects missing event-specific correlation and unsafe payloads", () => {
    expect(buildTypedObservabilityEvent({
      eventId: "event-1",
      kind: "execution_started",
      purpose: "field_debug",
      at: 1,
      correlation: baseCorrelation,
      reasonCode: "execution_dispatched",
      summary: "Execution started",
    })).toEqual({ status: "rejected", reasonCode: "attempt_id_required" })

    expect(buildTypedObservabilityEvent({
      eventId: "event-2",
      kind: "evidence_recorded",
      purpose: "development",
      at: 2,
      correlation: { ...baseCorrelation, attemptId: "attempt-1", evidenceId: "evidence-1" },
      reasonCode: "evidence_received",
      summary: "Evidence received",
      attributes: { rawToolResponse: "secret result" },
    })).toEqual({ status: "rejected", reasonCode: "unsafe_attribute_key" })

    expect(buildTypedObservabilityEvent({
      eventId: "event-3",
      kind: "finalization_completed",
      purpose: "product",
      at: 3,
      correlation: { ...baseCorrelation, reviewId: "review-1" },
      reasonCode: "report_delivered",
      summary: "Saved at /Users/example/private/result.txt",
    })).toEqual({ status: "rejected", reasonCode: "unsafe_summary" })

    expect(buildTypedObservabilityEvent({
      eventId: "event-4",
      kind: "analysis_completed",
      purpose: "product",
      at: 4,
      correlation: baseCorrelation,
      reasonCode: "solution_selected",
      summary: "Solution selected",
      attributes: { agentId: "agent-internal" },
    })).toEqual({ status: "rejected", reasonCode: "unsafe_attribute_key" })
  })

  it("projects a valid analysis-to-finalization trace without parsing summaries", () => {
    const events = [
      ready({
        eventId: "event-2",
        kind: "execution_started",
        purpose: "field_debug",
        at: 20,
        correlation: { ...baseCorrelation, attemptId: "attempt-1" },
        reasonCode: "execution_dispatched",
        summary: "Execution started",
      }),
      ready({
        eventId: "event-1",
        kind: "analysis_completed",
        purpose: "product",
        at: 10,
        correlation: baseCorrelation,
        reasonCode: "solution_selected",
        summary: "Solution selected",
      }),
      ready({
        eventId: "event-3",
        kind: "evidence_recorded",
        purpose: "field_debug",
        at: 30,
        correlation: { ...baseCorrelation, attemptId: "attempt-1", evidenceId: "evidence-1" },
        reasonCode: "evidence_received",
        summary: "Evidence recorded",
      }),
      ready({
        eventId: "event-4",
        kind: "review_completed",
        purpose: "product",
        at: 40,
        correlation: { ...baseCorrelation, reviewId: "review-1", evidenceId: "evidence-1" },
        reasonCode: "goal_satisfied",
        summary: "Result verified",
      }),
      ready({
        eventId: "event-5",
        kind: "finalization_completed",
        purpose: "product",
        at: 50,
        correlation: { ...baseCorrelation, reviewId: "review-1" },
        reasonCode: "report_delivered",
        summary: "Result delivered",
      }),
    ]

    const projection = projectTypedObservabilityTrace(events)

    expect(projection.events.map((event) => event.kind)).toEqual([
      "analysis_completed",
      "execution_started",
      "evidence_recorded",
      "review_completed",
      "finalization_completed",
    ])
    expect(projection.issues).toEqual([])
    expect(projection.terminal).toBe(true)
  })

  it("reports cross-request links, stage regression, and duplicate finalization", () => {
    const events = [
      ready({
        eventId: "event-final-1",
        kind: "finalization_completed",
        purpose: "product",
        at: 10,
        correlation: { ...baseCorrelation, reviewId: "review-1" },
        reasonCode: "report_delivered",
        summary: "Result delivered",
      }),
      ready({
        eventId: "event-analysis",
        kind: "analysis_completed",
        purpose: "product",
        at: 20,
        correlation: baseCorrelation,
        reasonCode: "solution_selected",
        summary: "Solution selected",
      }),
      ready({
        eventId: "event-final-2",
        kind: "finalization_completed",
        purpose: "product",
        at: 30,
        correlation: { ...baseCorrelation, requestId: "request-2", reviewId: "review-2" },
        reasonCode: "report_delivered",
        summary: "Result delivered",
      }),
    ]

    const projection = projectTypedObservabilityTrace(events)
    expect(projection.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "stage_regression",
      "cross_request_link",
      "duplicate_finalization",
    ]))
  })

  it("routes events through exactly one explicit log purpose", () => {
    const logger = {
      product: vi.fn(),
      fieldDebug: vi.fn(),
      development: vi.fn(),
    }
    const purposes = ["product", "field_debug", "development"] as const

    for (const [index, purpose] of purposes.entries()) {
      const event = ready({
        eventId: `event-log-${index}`,
        kind: "analysis_completed",
        purpose,
        at: index,
        correlation: baseCorrelation,
        reasonCode: "solution_selected",
        summary: "Solution selected",
      })
      expect(writeTypedObservabilityLog(logger, event)).toEqual({
        eventId: `event-log-${index}`,
        purpose,
        written: true,
      })
    }

    expect(logger.product).toHaveBeenCalledOnce()
    expect(logger.fieldDebug).toHaveBeenCalledOnce()
    expect(logger.development).toHaveBeenCalledOnce()
  })

  it("keeps child work ordering independent while requiring an explicit parent run", () => {
    const rootAnalysis = ready({
      eventId: "event-root-analysis",
      kind: "analysis_completed",
      purpose: "product",
      at: 10,
      correlation: baseCorrelation,
      reasonCode: "solution_selected",
      summary: "Solution selected",
    })
    const childExecution = ready({
      eventId: "event-child-execution",
      kind: "execution_started",
      purpose: "field_debug",
      at: 20,
      correlation: {
        ...baseCorrelation,
        runId: "run-child",
        parentRunId: "run-root",
        workId: "work-child",
        attemptId: "attempt-child",
      },
      reasonCode: "child_dispatched",
      summary: "Child execution started",
    })
    const rootExecution = ready({
      eventId: "event-root-execution",
      kind: "execution_started",
      purpose: "field_debug",
      at: 30,
      correlation: { ...baseCorrelation, attemptId: "attempt-root" },
      reasonCode: "execution_dispatched",
      summary: "Execution started",
    })

    expect(projectTypedObservabilityTrace([rootAnalysis, childExecution, rootExecution]).issues).toEqual([])

    const missingParent = ready({
      ...childExecution,
      eventId: "event-orphan",
      correlation: { ...childExecution.correlation, parentRunId: "run-missing" },
    })
    expect(projectTypedObservabilityTrace([rootAnalysis, missingParent]).issues).toContainEqual({
      code: "missing_parent_run",
      eventId: "event-orphan",
    })
  })
})
