import { describe, expect, it } from "vitest"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import type { OrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"

function registry(): OrchestrationRegistrySnapshot {
  const agentId = "agent:research"
  return {
    generatedAt: 1,
    agents: [
      {
        agentId,
        status: "enabled",
        delegationEnabled: true,
        skillMcpSummary: {
          enabledSkillIds: ["skill:enabled"],
          enabledMcpServerIds: [],
          enabledToolNames: ["enabled_tool"],
          disabledToolNames: ["disabled_tool", "mcp__private__query"],
        },
        capabilitySummary: {
          availability: "degraded",
          disabledSkillIds: ["skill:disabled"],
          disabledMcpServerIds: ["mcp:private"],
          skillBindings: [
            {
              catalogId: "skill:enabled",
              available: true,
              reasonCodes: [],
              enabledToolNames: ["enabled_tool", "disabled_tool"],
              disabledToolNames: ["disabled_tool"],
              risk: "safe",
              secretScope: { configured: true, scopeId: "secret:must-not-leak" },
            },
            {
              catalogId: "skill:disabled",
              available: false,
              reasonCodes: ["capability_binding_disabled"],
              enabledToolNames: ["disabled_skill_tool"],
              disabledToolNames: [],
              risk: "safe",
              secretScope: { configured: true, scopeId: "secret:must-not-leak" },
            },
          ],
          mcpServerBindings: [
            {
              catalogId: "mcp:private",
              available: false,
              reasonCodes: ["mcp_secret_scope_missing"],
              enabledToolNames: ["mcp__private__query"],
              disabledToolNames: [],
              risk: "external",
              secretScope: { configured: false },
            },
          ],
        },
      } as OrchestrationRegistrySnapshot["agents"][number],
    ],
    teams: [],
    membershipEdges: [],
    diagnostics: [],
    capabilityIndex: {
      generatedAt: 1,
      cacheKey: "registry:task034",
      rootAgentId: "agent:knowbee",
      topLevelCandidateAgentIds: [agentId],
      directChildAgentIdsByParent: { "agent:knowbee": [agentId] },
      candidateAgentIdsByParent: { "agent:knowbee": [agentId] },
      excludedCandidatesByParent: { "agent:knowbee": [] },
      candidatesByAgentId: {
        [agentId]: [
          {
            parentAgentId: "agent:knowbee",
            agentId,
            eligible: true,
            reasonCodes: [],
            specialtyTags: [],
            enabledSkillIds: ["skill:enabled"],
            enabledMcpServerIds: [],
            enabledToolNames: ["enabled_tool"],
            modelAvailability: "available",
            capabilityAvailability: "degraded",
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

function exactIntake(capabilityId: string): TaskIntakeResult {
  return {
    action_items: [
      {
        id: "action:1",
        type: "run_task",
        title: "Use exact agent capability",
        priority: "normal",
        reason: "requested",
        payload: {
          preferred_methods: [capabilityId],
          exclusive_methods: [capabilityId],
          target_instance: "agent:research",
        },
      },
    ],
  } as TaskIntakeResult
}

function registryWithAlternativeAgent(): OrchestrationRegistrySnapshot {
  const snapshot = registry()
  const sourceAgent = snapshot.agents[0]
  const sourceCandidate = snapshot.capabilityIndex?.candidatesByAgentId["agent:research"]?.[0]
  const sourceBinding = sourceAgent?.capabilitySummary.skillBindings[0]
  if (!sourceAgent || !sourceBinding || !sourceCandidate || !snapshot.capabilityIndex) {
    throw new Error("Task034 registry fixture is incomplete.")
  }
  const alternateAgent = structuredClone(sourceAgent)
  alternateAgent.agentId = "agent:alternate"
  alternateAgent.skillMcpSummary = {
    enabledSkillIds: ["skill:disabled"],
    enabledMcpServerIds: [],
    enabledToolNames: ["disabled_skill_tool"],
    disabledToolNames: [],
  }
  alternateAgent.capabilitySummary = {
    ...alternateAgent.capabilitySummary,
    availability: "available",
    disabledSkillIds: [],
    disabledMcpServerIds: [],
    skillBindings: [
      {
        ...sourceBinding,
        agentId: "agent:alternate",
        catalogId: "skill:disabled",
        available: true,
        reasonCodes: [],
        enabledToolNames: ["disabled_skill_tool"],
        disabledToolNames: [],
      },
    ],
    mcpServerBindings: [],
  }
  snapshot.agents.push(alternateAgent)
  snapshot.capabilityIndex.topLevelCandidateAgentIds.push("agent:alternate")
  snapshot.capabilityIndex.directChildAgentIdsByParent["agent:knowbee"]?.push("agent:alternate")
  snapshot.capabilityIndex.candidateAgentIdsByParent["agent:knowbee"]?.push("agent:alternate")
  snapshot.capabilityIndex.candidatesByAgentId["agent:alternate"] = [
    {
      ...structuredClone(sourceCandidate),
      agentId: "agent:alternate",
      enabledSkillIds: ["skill:disabled"],
      enabledToolNames: ["disabled_skill_tool"],
      capabilityAvailability: "available",
    },
  ]
  return snapshot
}

describe("Task 034 per-agent capability binding admission", () => {
  it("projects unavailable Skill, MCP and tool bindings as public exclusions", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry: registry(),
      tools: [],
    })

    expect(snapshot.bindings).toEqual([
      { capabilityId: "enabled_tool", targetId: "agent:research", risk: "safe" },
      { capabilityId: "skill:enabled", targetId: "agent:research", risk: "safe" },
    ])
    expect(snapshot.exclusions).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "skill:disabled",
          targetId: "agent:research",
          reasonCodes: ["capability_binding_disabled"],
        },
        {
          capabilityId: "disabled_tool",
          targetId: "agent:research",
          reasonCodes: ["tool_disabled_by_agent_policy"],
        },
        {
          capabilityId: "mcp:private",
          targetId: "agent:research",
          reasonCodes: ["mcp_secret_scope_missing"],
        },
        {
          capabilityId: "mcp__private__query",
          targetId: "agent:research",
          reasonCodes: ["mcp_secret_scope_missing"],
        },
      ]),
    )
    expect(JSON.stringify(snapshot)).not.toContain("secret:must-not-leak")
  })

  it.each([
    ["skill:disabled", "capability_binding_disabled"],
    ["disabled_tool", "tool_disabled_by_agent_policy"],
    ["mcp:private", "mcp_secret_scope_missing"],
    ["mcp__private__query", "mcp_secret_scope_missing"],
  ])("rejects exact target use of unavailable capability %s", (capabilityId, reasonCode) => {
    const result = buildCanonicalIntakePlanPolicy({
      runId: `run:${capabilityId}`,
      intake: exactIntake(capabilityId),
      registry: registry(),
      tools: [],
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "exclusive_method_unavailable",
      decision: { outcome: "input_required" },
    })
    expect(result.ok ? undefined : result.input?.capabilitySnapshot.exclusions).toContainEqual({
      capabilityId,
      targetId: "agent:research",
      reasonCodes: [reasonCode],
    })
    expect(JSON.stringify(result)).not.toContain("secret:must-not-leak")
  })

  it("allows the same Skill only on another explicitly selected eligible agent", () => {
    const snapshot = registryWithAlternativeAgent()
    const allowedIntake = exactIntake("skill:disabled")
    const action = allowedIntake.action_items[0]
    if (!action) throw new Error("Task034 intake fixture is incomplete.")
    action.payload = { ...action.payload, target_instance: "agent:alternate" }

    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:alternate",
      intake: allowedIntake,
      registry: snapshot,
      tools: [],
    })

    expect(result).toMatchObject({ ok: true, descriptor: { kind: "policy" } })
    if (!result.ok) throw new Error("Expected alternate agent policy to be allowed.")
    expect(result.input.capabilitySnapshot.bindings).toContainEqual({
      capabilityId: "skill:disabled",
      targetId: "agent:alternate",
      risk: "safe",
    })
    expect(result.input.capabilitySnapshot.exclusions).toContainEqual({
      capabilityId: "skill:disabled",
      targetId: "agent:research",
      reasonCodes: ["capability_binding_disabled"],
    })
  })
})
