import { describe, expect, it } from "vitest"
import type { OrchestrationRegistrySnapshot } from "../packages/core/src/orchestration/registry.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { projectYeonjangRuntimeHealthObservations } from "../packages/core/src/runs/runtime-capability-health.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"

function yeonjangTool(): AnyTool {
  return {
    name: "screen_capture",
    description: "Capture a screen through Yeonjang.",
    parameters: { type: "object", properties: {} },
    riskLevel: "safe",
    requiresApproval: false,
    evidenceSourceKind: "yeonjang",
    runtimeHealthMode: "required",
    runtimeMethodIds: ["screen_capture"],
    execute: async () => ({ success: true, output: "captured" }),
  }
}

function instance(instanceId: string, runnableTarget: boolean): YeonjangRegistryInstanceView {
  return {
    instanceId,
    runnableTarget,
    runnableReasonCodes: runnableTarget ? [] : ["target_permission_denied"],
  } as YeonjangRegistryInstanceView
}

function agentRegistry(): OrchestrationRegistrySnapshot {
  return {
    generatedAt: 1,
    agents: [
      {
        agentId: "agent:research",
        status: "enabled",
        delegationEnabled: true,
        skillMcpSummary: {
          enabledSkillIds: ["skill:market-research"],
          enabledMcpServerIds: ["mcp:market"],
          enabledToolNames: ["mcp__market__quote"],
          disabledToolNames: [],
        },
        capabilitySummary: {
          availability: "available",
          skillBindings: [
            {
              catalogId: "skill:market-research",
              available: true,
              reasonCodes: [],
              enabledToolNames: [],
              disabledToolNames: [],
              risk: "safe",
            },
          ],
          mcpServerBindings: [
            {
              catalogId: "mcp:market",
              available: true,
              reasonCodes: [],
              enabledToolNames: ["mcp__market__quote"],
              disabledToolNames: [],
              risk: "safe",
            },
          ],
        },
      } as OrchestrationRegistrySnapshot["agents"][number],
      {
        agentId: "agent:writer",
        status: "enabled",
        delegationEnabled: true,
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
      } as OrchestrationRegistrySnapshot["agents"][number],
    ],
    teams: [],
    membershipEdges: [],
    diagnostics: [],
  }
}

describe("Task 097 connected Yeonjang, Skill, and MCP means", () => {
  it("projects only the exact runnable Yeonjang computer with the allowed method", () => {
    const tool = yeonjangTool()
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [instance("office", true), instance("home", false)],
      tools: [tool],
      methodSnapshots: [
        { instanceId: "office", methods: ["screen_capture"] },
        { instanceId: "home", methods: ["screen_capture"] },
      ],
      observedAt: 1_000,
    })
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry: { generatedAt: 1, agents: [], teams: [], membershipEdges: [], diagnostics: [] },
      tools: [tool],
      snapshotAt: 1_000,
      runtimeHealthObservations: observations,
    })

    expect(snapshot.bindings).toContainEqual({
      capabilityId: "screen_capture",
      targetId: "yeonjang:office",
      risk: "safe",
    })
    expect(snapshot.bindings).not.toContainEqual(
      expect.objectContaining({ targetId: "yeonjang:home" }),
    )
    expect(snapshot.exclusions).toContainEqual({
      capabilityId: "screen_capture",
      targetId: "yeonjang:home",
      reasonCodes: ["target_permission_denied"],
    })
  })

  it("projects active Skill and MCP bindings only to their owning agent", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry: agentRegistry(),
      tools: [],
    })

    expect(snapshot.bindings).toEqual(
      expect.arrayContaining([
        {
          capabilityId: "skill:market-research",
          targetId: "agent:research",
          risk: "safe",
        },
        { capabilityId: "mcp:market", targetId: "agent:research", risk: "safe" },
        {
          capabilityId: "mcp__market__quote",
          targetId: "agent:research",
          risk: "safe",
        },
      ]),
    )
    expect(
      snapshot.bindings.some(
        (binding) =>
          binding.targetId === "agent:writer" &&
          (binding.capabilityId === "mcp:market" || binding.capabilityId === "mcp__market__quote"),
      ),
    ).toBe(false)
  })
})
