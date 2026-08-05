import { describe, expect, it } from "vitest"
import type { ResolutionAttemptRecord } from "../packages/core/src/contracts/recursive-resolution-admission.ts"
import {
  bindResourceReassessment,
  buildResourceDecisionRequest,
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
    workId: "work:101",
    stepId: "resolve-value",
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

function candidate(
  id: string,
  overrides: Partial<
    Parameters<typeof evaluateRecursiveContinuation>[0]["candidates"][number]
  > = {},
): Parameters<typeof evaluateRecursiveContinuation>[0]["candidates"][number] {
  return {
    candidateId: id,
    meansId: `means:${id}`,
    inputRefs: [`input:${id}`],
    targetId: "agent:knowbee",
    strategyFingerprint: `strategy:${id}`,
    goalCompletionProspect: "plausible",
    permissionStatus: "allowed",
    connectionStatus: "connected",
    policyStatus: "allowed",
    capabilityConfirmed: true,
    executable: true,
    evidenceRefs: [`evidence:${id}`],
    ...overrides,
  }
}

describe("Task 101 resource reassessment and scoped candidate exhaustion", () => {
  it("binds an approaching resource limit to current evidence and changed candidates", () => {
    const resourceDecision = evaluateResolutionResources({
      consumed: {
        wallTimeMs: 850,
        modelTokens: 200,
        externalCostMicros: 100,
        executionTimeMs: 100,
      },
      limits: {
        wallTimeMs: 1_000,
        modelTokens: 1_000,
        externalCostMicros: 1_000,
        executionTimeMs: 1_000,
      },
      reassessAtRatio: 0.8,
    })
    const continuationDecision = evaluateRecursiveContinuation({
      workId: "work:101",
      unresolvedGoal: "Return the current value.",
      retryCount: 1,
      priorAttempts: [firstFailure],
      candidates: [candidate("source-fetch")],
    })

    expect(
      bindResourceReassessment({
        resourceDecision,
        continuationDecision,
        currentEvidenceRefs: ["evidence:search-result", "evidence:missing-current-value"],
      }),
    ).toEqual({
      status: "reassess",
      dimensions: ["wall_time"],
      currentEvidenceRefs: ["evidence:search-result", "evidence:missing-current-value"],
      changedCandidateIds: ["source-fetch"],
    })
  })

  it("rejects resource reassessment without evidence or a changed candidate", () => {
    expect(
      bindResourceReassessment({
        resourceDecision: { status: "reassess", dimensions: ["model_tokens"] },
        continuationDecision: {
          status: "reassess",
          reason: "no_viable_changed_candidate",
          scope: {
            kind: "current_runtime_snapshot",
            workId: "work:101",
            evaluatedCandidateIds: [],
          },
          excludedCandidates: [],
        },
        currentEvidenceRefs: [],
      }),
    ).toEqual({
      status: "rejected",
      reasonCodes: ["current_evidence_missing", "changed_candidate_missing"],
    })
  })

  it("builds an exact user decision request with progress and positive resource increments", () => {
    expect(
      buildResourceDecisionRequest({
        workId: "work:101",
        resourceDecision: {
          status: "user_decision_required",
          dimensions: ["model_tokens", "external_cost"],
        },
        progress: {
          attemptedStepIds: ["step:search", "step:fetch"],
          completedStepIds: ["step:search"],
          unresolvedCriteria: ["criterion:current-value"],
          evidenceRefs: ["evidence:search", "evidence:fetch-failure"],
        },
        requestedIncreases: [
          { dimension: "model_tokens", additionalAmount: 2_000 },
          { dimension: "external_cost", additionalAmount: 500_000 },
        ],
      }),
    ).toEqual({
      status: "user_decision_required",
      workId: "work:101",
      progress: {
        attemptedStepIds: ["step:search", "step:fetch"],
        completedStepIds: ["step:search"],
        unresolvedCriteria: ["criterion:current-value"],
        evidenceRefs: ["evidence:search", "evidence:fetch-failure"],
      },
      requestedIncreases: [
        { dimension: "model_tokens", additionalAmount: 2_000 },
        { dimension: "external_cost", additionalAmount: 500_000 },
      ],
    })
  })

  it("rejects broad, missing, duplicate, or zero-value resource decisions", () => {
    expect(
      buildResourceDecisionRequest({
        workId: "work:101",
        resourceDecision: {
          status: "user_decision_required",
          dimensions: ["model_tokens", "external_cost"],
        },
        progress: {
          attemptedStepIds: ["step:search"],
          completedStepIds: [],
          unresolvedCriteria: ["criterion:current-value"],
          evidenceRefs: ["evidence:search"],
        },
        requestedIncreases: [
          { dimension: "model_tokens", additionalAmount: 0 },
          { dimension: "model_tokens", additionalAmount: 100 },
        ],
      }),
    ).toEqual({
      status: "rejected",
      reasonCodes: ["resource_decision_not_exact", "resource_increment_invalid"],
    })
  })

  it("scopes no viable candidate to current permission, connection, policy, and capability evidence", () => {
    const cycleAttempt = failedAttempt({
      attemptId: "attempt:3",
      meansId: "web_search",
      strategy: "strategy:search:v1",
      failureCause: "requested_value_missing",
    })
    const result = evaluateRecursiveContinuation({
      workId: "work:101",
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
        cycleAttempt,
      ],
      candidates: [
        candidate("permission", { permissionStatus: "denied" }),
        candidate("connection", { connectionStatus: "unavailable" }),
        candidate("policy", { policyStatus: "denied" }),
        candidate("capability", { capabilityConfirmed: false }),
        candidate("execution", { executable: false }),
        candidate("prospect", { goalCompletionProspect: "implausible" }),
        candidate("cycle", { strategyFingerprint: "strategy:search:v1" }),
        candidate("unchanged", {
          meansId: firstFailure.meansId,
          inputRefs: firstFailure.inputRefs,
          targetId: firstFailure.targetId,
          strategyFingerprint: firstFailure.strategyFingerprint,
        }),
      ],
    })

    expect(result).toEqual({
      status: "reassess",
      reason: "no_viable_changed_candidate",
      scope: {
        kind: "current_runtime_snapshot",
        workId: "work:101",
        evaluatedCandidateIds: [
          "permission",
          "connection",
          "policy",
          "capability",
          "execution",
          "prospect",
          "cycle",
          "unchanged",
        ],
      },
      excludedCandidates: [
        { candidateId: "permission", reasonCodes: ["permission_denied"] },
        { candidateId: "connection", reasonCodes: ["connection_unavailable"] },
        { candidateId: "policy", reasonCodes: ["policy_denied"] },
        { candidateId: "capability", reasonCodes: ["capability_unconfirmed"] },
        { candidateId: "execution", reasonCodes: ["not_executable"] },
        { candidateId: "prospect", reasonCodes: ["goal_implausible"] },
        { candidateId: "cycle", reasonCodes: ["cycle_detected"] },
        {
          candidateId: "unchanged",
          reasonCodes: ["cycle_detected", "unchanged_attempt"],
        },
      ],
    })
  })
})
