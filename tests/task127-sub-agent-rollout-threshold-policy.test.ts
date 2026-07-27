import { describe, expect, it } from "vitest"

import { runSubAgentBenchmarkSuite } from "../packages/core/src/benchmarks/sub-agent-benchmarks.ts"
import {
  SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
  type SubAgentReleaseReadinessOptions,
  buildSubAgentReleaseReadinessSummary,
} from "../packages/core/src/release/sub-agent-release-gate.ts"
import {
  type SubAgentRolloutThresholdAuthorizationPort,
  type SubAgentRolloutThresholdAuthorizationReceipt,
  type SubAgentRolloutThresholdPolicyCandidate,
  activateSubAgentRolloutThresholdPolicy,
  validateSubAgentRolloutThresholdPolicy,
} from "../packages/core/src/release/sub-agent-rollout-threshold-policy.ts"

const now = new Date("2026-07-17T00:00:00.000Z")

function candidate(
  overrides: Partial<SubAgentRolloutThresholdPolicyCandidate> = {},
): SubAgentRolloutThresholdPolicyCandidate {
  return {
    schemaVersion: 1,
    policyId: "rollout-thresholds:test-only",
    policyVersion: 1,
    releaseMode: "limited_beta",
    thresholds: { ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS },
    ...overrides,
  }
}

function receipt(
  policy: SubAgentRolloutThresholdPolicyCandidate,
  overrides: Partial<SubAgentRolloutThresholdAuthorizationReceipt> = {},
): SubAgentRolloutThresholdAuthorizationReceipt {
  return {
    schemaVersion: 1,
    authorizationId: "authorization:test-only",
    decision: "approved",
    actorType: "administrator",
    actorId: "administrator:test",
    scope: "sub_agent_rollout_thresholds",
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    releaseMode: policy.releaseMode,
    thresholdSnapshot: { ...policy.thresholds },
    approvedAt: now.getTime(),
    ...overrides,
  }
}

function authorizationPort(
  resolve: SubAgentRolloutThresholdAuthorizationPort["resolve"],
): SubAgentRolloutThresholdAuthorizationPort {
  return { resolve }
}

function benchmarkCheck(options: SubAgentReleaseReadinessOptions = {}) {
  const summary = buildSubAgentReleaseReadinessSummary({ now, ...options })
  const check = summary.checks.find((candidate) => candidate.id === "benchmark_threshold")
  if (!check) throw new Error("benchmark_threshold check is required")
  return { summary, check }
}

describe("task127 sub-agent rollout threshold authorization", () => {
  it("ignores legacy caller threshold overrides and fails closed without an active policy", () => {
    const legacyOptions = {
      thresholds: {
        spawnAckP95Ms: Number.MAX_SAFE_INTEGER,
        hotRegistrySnapshotP95Ms: Number.MAX_SAFE_INTEGER,
        plannerHotPathP95Ms: Number.MAX_SAFE_INTEGER,
        firstProgressP95Ms: Number.MAX_SAFE_INTEGER,
        restartRecoveryP95Ms: Number.MAX_SAFE_INTEGER,
      },
    } as SubAgentReleaseReadinessOptions & { thresholds: Record<string, number> }

    const { summary, check } = benchmarkCheck(legacyOptions)

    expect(summary.operationalReferenceThresholds).toEqual(
      SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
    )
    expect(check).toMatchObject({
      required: true,
      status: "failed",
      evidence: {
        policyStatus: "baseline_only",
        reasonCodes: ["rollout_threshold_policy_missing"],
      },
    })
  })

  it("rejects mutable duplicate tolerance and malformed numeric thresholds", () => {
    const duplicateTolerance = validateSubAgentRolloutThresholdPolicy(
      candidate({
        thresholds: {
          ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
          duplicateFinalAnswerCount: 1 as 0,
        },
      }),
    )
    const fractionalThreshold = validateSubAgentRolloutThresholdPolicy(
      candidate({
        thresholds: {
          ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
          plannerHotPathP95Ms: 1.5,
        },
      }),
    )

    expect(duplicateTolerance).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_duplicate_final_must_be_zero"],
    })
    expect(fractionalThreshold).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_invalid:plannerHotPathP95Ms"],
    })
  })

  it("rejects missing, system-owned, and threshold-mismatched authorization receipts", () => {
    const policy = candidate()
    const missing = activateSubAgentRolloutThresholdPolicy({
      candidate: policy,
      authorizationPort: authorizationPort(() => undefined),
    })
    const systemOwned = activateSubAgentRolloutThresholdPolicy({
      candidate: policy,
      authorizationPort: authorizationPort(() =>
        receipt(policy, { actorType: "system", actorId: "system:release" }),
      ),
    })
    const mismatched = activateSubAgentRolloutThresholdPolicy({
      candidate: policy,
      authorizationPort: authorizationPort(() =>
        receipt(policy, {
          thresholdSnapshot: {
            ...policy.thresholds,
            spawnAckP95Ms: policy.thresholds.spawnAckP95Ms + 1,
          },
        }),
      ),
    })

    expect(missing).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_authorization_missing"],
    })
    expect(systemOwned).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_authorization_actor_invalid"],
    })
    expect(mismatched).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_authorization_binding_mismatch"],
    })
  })

  it("evaluates benchmark evidence only with an exactly bound administrator policy", () => {
    const policy = candidate()
    const approvedPort = authorizationPort(() => receipt(policy))
    const { check } = benchmarkCheck({
      rolloutThresholdPolicy: { candidate: policy, authorizationPort: approvedPort },
    })

    expect(check).toMatchObject({
      status: "passed",
      evidence: {
        policyStatus: "active",
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        authorizationId: "authorization:test-only",
        releaseMode: "limited_beta",
        thresholdFailures: [],
      },
    })
  })

  it("fails mode mismatch and an approved restrictive threshold", () => {
    const fullEnablePolicy = candidate({ releaseMode: "full_enable" })
    const modeMismatch = benchmarkCheck({
      requestedMode: "limited_beta",
      rolloutThresholdPolicy: {
        candidate: fullEnablePolicy,
        authorizationPort: authorizationPort(() => receipt(fullEnablePolicy)),
      },
    })
    const suite = runSubAgentBenchmarkSuite({ now })
    const restrictivePolicy = candidate({
      thresholds: {
        ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
        spawnAckP95Ms: 1,
      },
    })
    const restrictive = benchmarkCheck({
      benchmarkSuite: suite,
      rolloutThresholdPolicy: {
        candidate: restrictivePolicy,
        authorizationPort: authorizationPort(() => receipt(restrictivePolicy)),
      },
    })

    expect(modeMismatch.check).toMatchObject({
      status: "failed",
      evidence: {
        policyStatus: "baseline_only",
        reasonCodes: ["rollout_threshold_release_mode_mismatch"],
      },
    })
    expect(restrictive.check.status).toBe("failed")
    expect(restrictive.check.evidence).toMatchObject({
      policyStatus: "active",
      thresholdFailures: [expect.stringMatching(/^spawn_ack_p95:/)],
    })
  })
})
