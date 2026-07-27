import { describe, expect, it } from "vitest"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import {
  projectMcpRuntimeHealthObservations,
  projectYeonjangRuntimeHealthObservations,
} from "../packages/core/src/runs/runtime-capability-health.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"

const registry = {
  generatedAt: 1,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

function runtimeTool(sourceKind: "mcp" | "yeonjang", name: string): AnyTool {
  return {
    name,
    description: `${sourceKind} tool`,
    parameters: { type: "object", properties: {} },
    riskLevel: "safe",
    requiresApproval: false,
    evidenceSourceKind: sourceKind,
    runtimeHealthMode: sourceKind === "yeonjang" ? "required" : undefined,
    runtimeMethodIds: sourceKind === "yeonjang" ? [name] : undefined,
    execute: async () => ({ success: true, output: "done" }),
  }
}

function exactIntake(capabilityId: string, targetId: string): TaskIntakeResult {
  return {
    action_items: [
      {
        id: "action:1",
        type: "run_task",
        title: "Run exact capability",
        priority: "normal",
        reason: "requested",
        payload: {
          preferred_methods: [capabilityId],
          exclusive_methods: [capabilityId],
          target_instance: targetId,
        },
      },
    ],
  } as TaskIntakeResult
}

describe("Task 031 runtime health capability admission", () => {
  it("excludes an MCP tool whose owning server is not ready", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [runtimeTool("mcp", "mcp__market__quote")],
      snapshotAt: 1_000,
      runtimeHealthObservations: [
        {
          capabilityId: "mcp__market__quote",
          targetId: "mcp:market",
          status: "unavailable",
          observedAt: 900,
          expiresAt: 1_900,
          reasonCodes: ["mcp_server_not_ready"],
        },
      ],
    })

    expect(snapshot.bindings).toEqual([])
    expect(snapshot.exclusions).toContainEqual({
      capabilityId: "mcp__market__quote",
      targetId: "mcp:market",
      reasonCodes: ["mcp_server_not_ready"],
    })
  })

  it("turns an expired ready Yeonjang observation into a stale exclusion", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [runtimeTool("yeonjang", "yeonjang_shell")],
      snapshotAt: 2_000,
      runtimeHealthObservations: [
        {
          capabilityId: "yeonjang_shell",
          targetId: "yeonjang:office",
          status: "ready",
          observedAt: 500,
          expiresAt: 1_500,
          reasonCodes: [],
        },
      ],
    })

    expect(snapshot.bindings).toEqual([])
    expect(snapshot.exclusions).toContainEqual({
      capabilityId: "yeonjang_shell",
      targetId: "yeonjang:office",
      reasonCodes: ["runtime_health_observation_stale"],
    })
  })

  it("rejects conflicting observations for the same capability target", () => {
    expect(() =>
      projectCanonicalCapabilitySnapshot({
        actionCapabilityIds: [],
        registry,
        tools: [runtimeTool("mcp", "mcp__market__quote")],
        snapshotAt: 1_000,
        runtimeHealthObservations: [
          {
            capabilityId: "mcp__market__quote",
            targetId: "mcp:market",
            status: "ready",
            observedAt: 900,
            expiresAt: 1_900,
            reasonCodes: [],
          },
          {
            capabilityId: "mcp__market__quote",
            targetId: "mcp:market",
            status: "unavailable",
            observedAt: 900,
            expiresAt: 1_900,
            reasonCodes: ["mcp_server_not_ready"],
          },
        ],
      }),
    ).toThrow(/conflicting runtime health observations/i)
  })

  it("projects MCP readiness without command, URL, or raw error details", () => {
    const observations = projectMcpRuntimeHealthObservations({
      observedAt: 1_000,
      statuses: [
        {
          name: "market",
          transport: "stdio",
          enabled: true,
          required: true,
          ready: false,
          toolCount: 1,
          registeredToolCount: 1,
          command: "secret-command",
          url: "https://secret.example",
          error: "secret-error",
          tools: [
            {
              name: "quote",
              registeredName: "mcp__market__quote",
              description: "Quote",
            },
          ],
        },
      ],
    })

    expect(observations).toEqual([
      {
        capabilityId: "mcp__market__quote",
        targetId: "mcp:market",
        status: "unavailable",
        observedAt: 1_000,
        expiresAt: 1_000,
        reasonCodes: ["mcp_server_not_ready"],
      },
    ])
    expect(JSON.stringify(observations)).not.toMatch(/secret-command|secret\.example|secret-error/u)
  })

  it("reuses Yeonjang registry runnable reasons without exposing registry detail", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      observedAt: 2_000,
      tools: [runtimeTool("yeonjang", "yeonjang_shell")],
      methodSnapshots: [{ instanceId: "office", methods: ["yeonjang_shell"] }],
      instances: [
        {
          instanceId: "office",
          runnableTarget: false,
          runnableReasonCodes: ["session_binding_unavailable"],
          stateMessage: "secret-state-detail",
        } as YeonjangRegistryInstanceView,
      ],
    })

    expect(observations).toEqual([
      {
        capabilityId: "yeonjang_shell",
        targetId: "yeonjang:office",
        status: "unavailable",
        observedAt: 2_000,
        expiresAt: 2_000,
        reasonCodes: ["session_binding_unavailable"],
      },
    ])
    expect(JSON.stringify(observations)).not.toContain("secret-state-detail")
  })

  it("does not substitute a ready Yeonjang instance for an unavailable exact target", () => {
    const capabilityId = "yeonjang_shell"
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:exact-offline",
      intake: exactIntake(capabilityId, "yeonjang:office"),
      registry,
      tools: [runtimeTool("yeonjang", capabilityId)],
      snapshotAt: 1_000,
      runtimeHealthObservations: [
        {
          capabilityId,
          targetId: "yeonjang:office",
          status: "unavailable",
          observedAt: 1_000,
          expiresAt: 1_000,
          reasonCodes: ["target_state_offline"],
        },
        {
          capabilityId,
          targetId: "yeonjang:home",
          status: "ready",
          observedAt: 1_000,
          expiresAt: 1_000,
          reasonCodes: [],
        },
      ],
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "target_binding_unavailable",
      decision: { outcome: "input_required" },
    })
  })

  it("keeps local execution and adds only ready Yeonjang targets for a mixed tool", () => {
    const tool = runtimeTool("yeonjang", "shell_exec")
    tool.runtimeHealthMode = "additional"
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [tool],
      snapshotAt: 1_000,
      runtimeHealthObservations: [
        {
          capabilityId: "shell_exec",
          targetId: "yeonjang:office",
          status: "ready",
          observedAt: 1_000,
          expiresAt: 1_000,
          reasonCodes: [],
        },
      ],
    })

    expect(snapshot.bindings).toEqual([
      { capabilityId: "shell_exec", targetId: "agent:knowbee", risk: "safe" },
      { capabilityId: "shell_exec", targetId: "yeonjang:office", risk: "safe" },
    ])
  })
})
