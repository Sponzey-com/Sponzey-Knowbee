import { describe, expect, it } from "vitest"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import type { OrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"

function intake(payload: Record<string, unknown>): TaskIntakeResult {
  return {
    action_items: [
      {
        id: "action:1",
        type: "run_task",
        title: "Research",
        priority: "normal",
        reason: "requested",
        payload,
      },
    ],
  } as TaskIntakeResult
}

function registryWithExcludedAgent(reasonCodes: string[]): OrchestrationRegistrySnapshot {
  const agentId = "agent:research"
  return {
    generatedAt: 2,
    agents: [
      {
        agentId,
        status: "disabled",
        skillMcpSummary: {
          enabledSkillIds: ["skill:research"],
          enabledMcpServerIds: [],
          enabledToolNames: [],
          disabledToolNames: [],
        },
        capabilitySummary: {
          availability: "available",
          skillBindings: [
            {
              catalogId: "skill:research",
              enabledToolNames: [],
              risk: "safe",
              secretScope: { configured: true, scopeId: "secret:must-not-leak" },
            },
          ],
          mcpServerBindings: [],
        },
      } as OrchestrationRegistrySnapshot["agents"][number],
    ],
    teams: [],
    membershipEdges: [],
    diagnostics: [],
    capabilityIndex: {
      generatedAt: 2,
      cacheKey: "registry:v2",
      rootAgentId: "agent:knowbee",
      topLevelCandidateAgentIds: [],
      directChildAgentIdsByParent: { "agent:knowbee": [agentId] },
      candidateAgentIdsByParent: { "agent:knowbee": [] },
      excludedCandidatesByParent: {
        "agent:knowbee": [{ agentId, reasonCodes }],
      },
      candidatesByAgentId: {
        [agentId]: [
          {
            parentAgentId: "agent:knowbee",
            agentId,
            eligible: false,
            reasonCodes,
            specialtyTags: [],
            enabledSkillIds: ["skill:research"],
            enabledMcpServerIds: [],
            enabledToolNames: [],
            modelAvailability: "available",
            capabilityAvailability: "available",
            load: {
              activeSubSessions: 0,
              queuedSubSessions: 0,
              failedSubSessions: 0,
              completedSubSessions: 0,
              maxParallelSessions: 1,
              utilization: 0,
            },
            failureRate: {
              windowMs: 0,
              consideredSubSessions: 0,
              failedSubSessions: 0,
              value: 0,
            },
          },
        ],
      },
      diagnostics: [],
      metrics: { buildLatencyMs: 1, targetP95Ms: 100 },
    },
  }
}

function registryWithEligibleAgent(): OrchestrationRegistrySnapshot {
  const registry = registryWithExcludedAgent([])
  const agent = registry.agents[0]
  const index = registry.capabilityIndex
  const candidate = agent && index?.candidatesByAgentId[agent.agentId]?.[0]
  if (!agent || !index || !candidate) throw new Error("Eligible agent fixture is incomplete.")

  agent.status = "enabled"
  agent.delegationEnabled = true
  candidate.eligible = true
  candidate.reasonCodes = []
  index.topLevelCandidateAgentIds = [agent.agentId]
  index.candidateAgentIdsByParent["agent:knowbee"] = [agent.agentId]
  index.excludedCandidatesByParent["agent:knowbee"] = []
  return registry
}

describe("Task 029 executable capability snapshot", () => {
  it.each([
    ["disabled", ["agent_disabled"]],
    ["saturated", ["concurrency_limit_reached"]],
    ["model unavailable", ["model_unavailable"]],
  ])(
    "does not advertise a catalog-enabled capability from an excluded %s agent",
    (_label, reasonCodes) => {
      const result = buildCanonicalIntakePlanPolicy({
        runId: "run:excluded",
        intake: intake({
          preferred_methods: ["skill:research"],
          exclusive_methods: ["skill:research"],
        }),
        registry: registryWithExcludedAgent(reasonCodes),
        tools: [],
      })

      expect(result).toMatchObject({
        ok: false,
        reasonCode: "exclusive_method_unavailable",
        decision: { outcome: "input_required" },
      })
      expect(result.ok ? undefined : result.input?.capabilitySnapshot.exclusions).toEqual([
        {
          capabilityId: "skill:research",
          targetId: "agent:research",
          reasonCodes,
        },
      ])
      expect(JSON.stringify(result)).not.toContain("secret:must-not-leak")
    },
  )

  it("allows an exact-target exclusive method only for an eligible direct child", () => {
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:eligible",
      intake: intake({
        preferred_methods: ["skill:research"],
        exclusive_methods: ["skill:research"],
        target_instance: "agent:research",
      }),
      registry: registryWithEligibleAgent(),
      tools: [],
    })

    expect(result).toMatchObject({ ok: true, descriptor: { kind: "policy" } })
  })

  it("projects the same secret-free executable snapshot from the same run-start inputs", () => {
    const input = {
      actionCapabilityIds: ["action:run_task"],
      registry: registryWithEligibleAgent(),
      tools: [],
    }
    const first = projectCanonicalCapabilitySnapshot(input)
    const second = projectCanonicalCapabilitySnapshot(input)

    expect(second).toEqual(first)
    expect(first.bindings).toContainEqual({
      capabilityId: "skill:research",
      targetId: "agent:research",
      risk: "safe",
    })
    expect(JSON.stringify(first)).not.toContain("secret:must-not-leak")
  })
})
