import { describe, expect, it } from "vitest"
import type { OrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"

const shellTool = {
  name: "shell_exec",
  description: "Execute through Yeonjang",
  parameters: { type: "object", properties: {} },
  riskLevel: "dangerous",
  requiresApproval: true,
  runtimeHealthMode: "additional",
  execute: async () => ({ success: true, output: "done" }),
} as AnyTool

function registry(enabled = true): OrchestrationRegistrySnapshot {
  return {
    generatedAt: 1_000,
    agents: [
      {
        agentId: "agent:operator",
        status: enabled ? "enabled" : "disabled",
        delegationEnabled: true,
        currentLoad: { activeSubSessions: 0, maxParallelSessions: 1 },
        skillMcpSummary: {
          enabledSkillIds: [],
          enabledMcpServerIds: [],
          enabledToolNames: [],
          disabledToolNames: [],
        },
        capabilitySummary: {
          availability: "available",
          skillBindings: [],
          mcpServerBindings: [],
        },
        modelSummary: { availability: "available" },
      } as OrchestrationRegistrySnapshot["agents"][number],
    ],
    teams: [],
    membershipEdges: [],
    diagnostics: [],
  }
}

describe("Task 035 Yeonjang agent binding execution snapshot", () => {
  it("advertises a healthy Yeonjang tool to the explicitly bound eligible agent", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry: registry(),
      tools: [shellTool],
      snapshotAt: 1_000,
      runtimeHealthObservations: [
        {
          capabilityId: "shell_exec",
          targetId: "yeonjang:office",
          status: "ready",
          observedAt: 1_000,
          expiresAt: 2_000,
          reasonCodes: [],
        },
      ],
      yeonjangAgentBindings: [{ agentId: "agent:operator", targetId: "yeonjang:office" }],
    })

    expect(snapshot.bindings).toContainEqual({
      capabilityId: "shell_exec",
      targetId: "agent:operator",
      risk: "approval_required",
    })
  })

  it("does not grant unbound, stale, or ineligible agent capability", () => {
    const base = {
      actionCapabilityIds: [],
      tools: [shellTool],
      snapshotAt: 3_000,
      runtimeHealthObservations: [
        {
          capabilityId: "shell_exec",
          targetId: "yeonjang:office",
          status: "ready" as const,
          observedAt: 1_000,
          expiresAt: 2_000,
          reasonCodes: [],
        },
      ],
    }
    const unbound = projectCanonicalCapabilitySnapshot({ ...base, registry: registry() })
    expect(unbound.bindings).not.toContainEqual(
      expect.objectContaining({ targetId: "agent:operator", capabilityId: "shell_exec" }),
    )

    const bound = projectCanonicalCapabilitySnapshot({
      ...base,
      registry: registry(false),
      yeonjangAgentBindings: [{ agentId: "agent:operator", targetId: "yeonjang:office" }],
    })
    expect(bound.exclusions).toContainEqual({
      capabilityId: "shell_exec",
      targetId: "agent:operator",
      reasonCodes: ["agent_disabled", "runtime_health_observation_stale"],
    })
  })
})
