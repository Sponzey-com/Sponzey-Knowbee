import { describe, expect, it } from "vitest"

import {
  type ReleasePolicyAuthorizationRecord,
  type ReleasePolicyAuthorizationRepository,
  authorizeSubAgentRolloutThresholdPolicy,
  createSubAgentRolloutThresholdAuthorizationPort,
} from "../packages/core/src/release/release-policy-authorization.ts"
import { SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS } from "../packages/core/src/release/sub-agent-release-gate.ts"
import {
  type SubAgentRolloutThresholdPolicyCandidate,
  activateSubAgentRolloutThresholdPolicy,
} from "../packages/core/src/release/sub-agent-rollout-threshold-policy.ts"

const now = 1_752_710_400_000

function candidate(
  overrides: Partial<SubAgentRolloutThresholdPolicyCandidate> = {},
): SubAgentRolloutThresholdPolicyCandidate {
  return {
    schemaVersion: 1,
    policyId: "rollout-policy:test-only",
    policyVersion: 1,
    releaseMode: "limited_beta",
    thresholds: { ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS },
    ...overrides,
  }
}

function principal(
  overrides: Partial<{
    principalType: "authenticated_user" | "system"
    principalId: string
    authenticationId: string
    roles: string[]
  }> = {},
) {
  return {
    principalType: "authenticated_user" as const,
    principalId: "administrator:test",
    authenticationId: "authentication:test",
    roles: ["release_administrator"],
    ...overrides,
  }
}

function memoryRepository(): ReleasePolicyAuthorizationRepository & {
  records: ReleasePolicyAuthorizationRecord[]
} {
  const records: ReleasePolicyAuthorizationRecord[] = []
  return {
    records,
    append(record) {
      if (records.some((candidate) => candidate.authorizationId === record.authorizationId)) {
        return { status: "duplicate_id" }
      }
      records.push(record)
      return { status: "stored" }
    },
    findLatest(binding) {
      return [...records]
        .reverse()
        .find(
          (record) =>
            record.scope === binding.scope &&
            record.policyId === binding.policyId &&
            record.policyVersion === binding.policyVersion &&
            record.releaseMode === binding.releaseMode,
        )
    },
  }
}

function recordDecision(input: {
  repository: ReleasePolicyAuthorizationRepository
  policy?: SubAgentRolloutThresholdPolicyCandidate
  decision: "approved" | "denied" | "revoked"
  authorizationId: string
}) {
  return authorizeSubAgentRolloutThresholdPolicy({
    candidate: input.policy ?? candidate(),
    decision: input.decision,
    principal: principal(),
    authorizationId: input.authorizationId,
    decidedAt: now,
    repository: input.repository,
  })
}

describe("task128 trusted release-policy authorization command", () => {
  it("rejects unauthenticated, system, and non-release-administrator principals", () => {
    const repository = memoryRepository()
    const inputs = [
      principal({ authenticationId: "" }),
      principal({ principalType: "system" }),
      principal({ roles: ["operator"] }),
    ]

    const decisions = inputs.map((candidatePrincipal, index) =>
      authorizeSubAgentRolloutThresholdPolicy({
        candidate: candidate(),
        decision: "approved",
        principal: candidatePrincipal,
        authorizationId: `authorization:rejected:${index}`,
        decidedAt: now,
        repository,
      }),
    )

    expect(decisions).toEqual([
      { status: "rejected", reasonCode: "release_authorization_authentication_required" },
      { status: "rejected", reasonCode: "release_authorization_principal_invalid" },
      { status: "rejected", reasonCode: "release_authorization_role_required" },
    ])
    expect(repository.records).toHaveLength(0)
  })

  it("stores an immutable exact candidate snapshot and rejects duplicate record IDs", () => {
    const repository = memoryRepository()
    const policy = candidate()
    const first = recordDecision({
      repository,
      policy,
      decision: "approved",
      authorizationId: "authorization:immutable",
    })
    policy.thresholds.spawnAckP95Ms = 999_999
    const duplicate = recordDecision({
      repository,
      decision: "approved",
      authorizationId: "authorization:immutable",
    })

    expect(first).toMatchObject({
      status: "recorded",
      record: {
        actorType: "administrator",
        actorId: "administrator:test",
        authenticationId: "authentication:test",
        decision: "approved",
        thresholdSnapshot: { spawnAckP95Ms: 300 },
      },
    })
    expect(Object.isFrozen(repository.records[0])).toBe(true)
    expect(Object.isFrozen(repository.records[0]?.thresholdSnapshot)).toBe(true)
    expect(duplicate).toEqual({
      status: "rejected",
      reasonCode: "release_authorization_id_duplicate",
    })
  })

  it("uses the latest append-only decision so denial and revocation invalidate approval", () => {
    const repository = memoryRepository()
    const policy = candidate()
    const port = createSubAgentRolloutThresholdAuthorizationPort(repository)

    recordDecision({
      repository,
      policy,
      decision: "approved",
      authorizationId: "authorization:approved:1",
    })
    expect(port.resolve(policy)?.decision).toBe("approved")

    recordDecision({
      repository,
      policy,
      decision: "denied",
      authorizationId: "authorization:denied:1",
    })
    expect(port.resolve(policy)).toBeUndefined()

    recordDecision({
      repository,
      policy,
      decision: "approved",
      authorizationId: "authorization:approved:2",
    })
    expect(port.resolve(policy)?.authorizationId).toBe("authorization:approved:2")

    recordDecision({
      repository,
      policy,
      decision: "revoked",
      authorizationId: "authorization:revoked:1",
    })
    expect(port.resolve(policy)).toBeUndefined()
    expect(repository.records.map((record) => record.decision)).toEqual([
      "approved",
      "denied",
      "approved",
      "revoked",
    ])
  })

  it("still fails exact activation when a candidate reuses identity with changed thresholds", () => {
    const repository = memoryRepository()
    const approved = candidate()
    recordDecision({
      repository,
      policy: approved,
      decision: "approved",
      authorizationId: "authorization:exact",
    })
    const changed = candidate({
      thresholds: {
        ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS,
        plannerHotPathP95Ms: 701,
      },
    })

    expect(
      activateSubAgentRolloutThresholdPolicy({
        candidate: changed,
        authorizationPort: createSubAgentRolloutThresholdAuthorizationPort(repository),
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_threshold_authorization_binding_mismatch"],
    })
  })
})
