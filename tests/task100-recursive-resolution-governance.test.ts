import { describe, expect, it } from "vitest"
import type { ResolutionAttemptRecord } from "../packages/core/src/contracts/recursive-resolution-admission.ts"
import {
  detectResolutionCycles,
  evaluateRecursiveContinuation,
  evaluateResolutionResources,
} from "../packages/core/src/contracts/recursive-resolution-governance.ts"

function failedAttempt(input: {
  attemptId: string
  meansId: string
  strategy: string
  failureCause: string
}): ResolutionAttemptRecord {
  return {
    attemptId: input.attemptId,
    workId: "work:100",
    stepId: "resolve-current-price",
    meansId: input.meansId,
    inputRefs: [`input:${input.attemptId}`],
    targetId: "agent:knowbee",
    strategyFingerprint: input.strategy,
    resultRefs: [`result:${input.attemptId}`],
    failureCause: input.failureCause,
    validation: {
      status: "failed",
      evidenceRefs: [`evidence:${input.attemptId}`],
      reason: input.failureCause,
    },
  }
}

const firstFailure = failedAttempt({
  attemptId: "attempt:1",
  meansId: "web_search",
  strategy: "strategy:search:v1",
  failureCause: "requested_value_missing",
})

describe("Task 100 recursive resolution governance", () => {
  it("continues with a viable materially different candidate regardless of retry count", () => {
    expect(
      evaluateRecursiveContinuation({
        workId: "work:100",
        unresolvedGoal: "Return the current value with a market timestamp.",
        retryCount: 10_000,
        priorAttempts: [firstFailure],
        candidates: [
          {
            candidateId: "candidate:official-source",
            meansId: "web_fetch",
            inputRefs: ["url:official-market"],
            targetId: "agent:knowbee",
            strategyFingerprint: "strategy:official-source:v2",
            goalCompletionProspect: "plausible",
            permissionStatus: "allowed",
            connectionStatus: "connected",
            policyStatus: "allowed",
            capabilityConfirmed: true,
            executable: true,
            evidenceRefs: ["capability:web-fetch", "policy:allowed"],
          },
        ],
      }),
    ).toEqual({ status: "continue", viableCandidateIds: ["candidate:official-source"] })
  })

  it("returns reassess rather than failure when retry count is the only exhaustion signal", () => {
    expect(
      evaluateRecursiveContinuation({
        workId: "work:100",
        unresolvedGoal: "Return the current value.",
        retryCount: 10_000,
        priorAttempts: [firstFailure],
        candidates: [],
      }),
    ).toEqual({
      status: "reassess",
      reason: "no_viable_changed_candidate",
      scope: {
        kind: "current_runtime_snapshot",
        workId: "work:100",
        evaluatedCandidateIds: [],
      },
      excludedCandidates: [],
    })
  })

  it("excludes denied, unavailable, unchanged, and cycle-blocked candidates", () => {
    const repeatedCycle = failedAttempt({
      attemptId: "attempt:3",
      meansId: "web_search",
      strategy: "strategy:search:v1",
      failureCause: "requested_value_missing",
    })
    const decision = evaluateRecursiveContinuation({
      workId: "work:100",
      unresolvedGoal: "Return the current value.",
      retryCount: 3,
      priorAttempts: [
        firstFailure,
        failedAttempt({
          attemptId: "attempt:2",
          meansId: "web_fetch",
          strategy: "strategy:fetch:v2",
          failureCause: "source_unavailable",
        }),
        repeatedCycle,
      ],
      candidates: [
        {
          candidateId: "candidate:cycle",
          meansId: "search_api",
          inputRefs: ["query:new"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:search:v1",
          goalCompletionProspect: "plausible",
          permissionStatus: "allowed",
          connectionStatus: "connected",
          policyStatus: "allowed",
          capabilityConfirmed: true,
          executable: true,
          evidenceRefs: ["capability:search-api"],
        },
        {
          candidateId: "candidate:denied",
          meansId: "paid_api",
          inputRefs: ["symbol:000660"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:paid-api:v3",
          goalCompletionProspect: "plausible",
          permissionStatus: "allowed",
          connectionStatus: "connected",
          policyStatus: "denied",
          capabilityConfirmed: true,
          executable: true,
          evidenceRefs: ["policy:denied"],
        },
        {
          candidateId: "candidate:unavailable",
          meansId: "mcp_quote",
          inputRefs: ["symbol:000660"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:mcp:v4",
          goalCompletionProspect: "plausible",
          permissionStatus: "allowed",
          connectionStatus: "unavailable",
          policyStatus: "allowed",
          capabilityConfirmed: true,
          executable: false,
          evidenceRefs: ["connection:offline"],
        },
        {
          candidateId: "candidate:implausible",
          meansId: "cached_summary",
          inputRefs: ["cache:yesterday"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:stale-cache:v5",
          goalCompletionProspect: "implausible",
          permissionStatus: "allowed",
          connectionStatus: "not_required",
          policyStatus: "allowed",
          capabilityConfirmed: true,
          executable: true,
          evidenceRefs: ["diagnosis:cannot-prove-current-value"],
        },
        {
          candidateId: "candidate:unchanged",
          meansId: firstFailure.meansId,
          inputRefs: [...firstFailure.inputRefs],
          targetId: firstFailure.targetId,
          strategyFingerprint: firstFailure.strategyFingerprint,
          goalCompletionProspect: "plausible",
          permissionStatus: "allowed",
          connectionStatus: "connected",
          policyStatus: "allowed",
          capabilityConfirmed: true,
          executable: true,
          evidenceRefs: ["diagnosis:unchanged"],
        },
      ],
    })

    expect(decision).toEqual({
      status: "reassess",
      reason: "no_viable_changed_candidate",
      scope: {
        kind: "current_runtime_snapshot",
        workId: "work:100",
        evaluatedCandidateIds: [
          "candidate:cycle",
          "candidate:denied",
          "candidate:unavailable",
          "candidate:implausible",
          "candidate:unchanged",
        ],
      },
      excludedCandidates: [
        { candidateId: "candidate:cycle", reasonCodes: ["cycle_detected"] },
        { candidateId: "candidate:denied", reasonCodes: ["policy_denied"] },
        {
          candidateId: "candidate:unavailable",
          reasonCodes: ["connection_unavailable", "not_executable"],
        },
        { candidateId: "candidate:implausible", reasonCodes: ["goal_implausible"] },
        {
          candidateId: "candidate:unchanged",
          reasonCodes: ["cycle_detected", "unchanged_attempt"],
        },
      ],
    })
  })

  it("reassesses near any explicit resource limit without declaring goal failure", () => {
    expect(
      evaluateResolutionResources({
        consumed: {
          wallTimeMs: 8_500,
          modelTokens: 200,
          externalCostMicros: 100,
          executionTimeMs: 400,
        },
        limits: {
          wallTimeMs: 10_000,
          modelTokens: 1_000,
          externalCostMicros: 1_000,
          executionTimeMs: 1_000,
        },
        reassessAtRatio: 0.8,
      }),
    ).toEqual({ status: "reassess", dimensions: ["wall_time"] })
  })

  it("requests a user decision when additional resources are required", () => {
    expect(
      evaluateResolutionResources({
        consumed: {
          wallTimeMs: 1_000,
          modelTokens: 1_000,
          externalCostMicros: 1_100,
          executionTimeMs: 1_000,
        },
        limits: {
          wallTimeMs: 10_000,
          modelTokens: 1_000,
          externalCostMicros: 1_000,
          executionTimeMs: 1_000,
        },
        reassessAtRatio: 0.8,
      }),
    ).toEqual({
      status: "user_decision_required",
      dimensions: ["model_tokens", "external_cost", "execution_time"],
    })
  })

  it("continues when every resource dimension is below the reassessment boundary", () => {
    expect(
      evaluateResolutionResources({
        consumed: {
          wallTimeMs: 100,
          modelTokens: 200,
          externalCostMicros: 300,
          executionTimeMs: 400,
        },
        limits: {
          wallTimeMs: 1_000,
          modelTokens: 1_000,
          externalCostMicros: 1_000,
          executionTimeMs: 1_000,
        },
        reassessAtRatio: 0.8,
      }),
    ).toEqual({
      status: "continue",
      remaining: {
        wallTimeMs: 900,
        modelTokens: 800,
        externalCostMicros: 700,
        executionTimeMs: 600,
      },
    })
  })

  it("detects a non-adjacent repeated failure-cause and strategy cycle", () => {
    const result = detectResolutionCycles([
      firstFailure,
      failedAttempt({
        attemptId: "attempt:2",
        meansId: "web_fetch",
        strategy: "strategy:fetch:v2",
        failureCause: "source_unavailable",
      }),
      failedAttempt({
        attemptId: "attempt:3",
        meansId: "web_search",
        strategy: "strategy:search:v1",
        failureCause: "requested_value_missing",
      }),
    ])

    expect(result).toEqual({
      status: "cycle_detected",
      cycles: [
        {
          failureCause: "requested_value_missing",
          strategyFingerprint: "strategy:search:v1",
          attemptIds: ["attempt:1", "attempt:3"],
        },
      ],
      blockedStrategyFingerprints: ["strategy:search:v1"],
    })
  })
})
