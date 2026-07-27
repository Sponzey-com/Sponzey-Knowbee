import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"

const localOnlyTool: AnyTool = {
  name: "local_only",
  description: "Local channel only",
  parameters: { type: "object", properties: {} },
  riskLevel: "safe",
  requiresApproval: false,
  availableSources: ["local"],
  execute: async () => ({ success: true, output: "done" }),
}

const registry = {
  generatedAt: 1,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

function intake(): TaskIntakeResult {
  return {
    action_items: [
      {
        id: "action:1",
        type: "run_task",
        title: "Run local tool",
        priority: "normal",
        reason: "requested",
        payload: {
          preferred_methods: ["local_only"],
          exclusive_methods: ["local_only"],
        },
      },
    ],
  } as TaskIntakeResult
}

describe("Task 030 channel-compatible capability snapshot", () => {
  it("keeps a channel-incompatible tool as exclusion instead of executable binding", () => {
    const snapshot = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [localOnlyTool],
      source: "telegram",
    })

    expect(snapshot.bindings).not.toContainEqual(
      expect.objectContaining({ capabilityId: "local_only" }),
    )
    expect(snapshot.exclusions).toContainEqual({
      capabilityId: "local_only",
      targetId: "agent:knowbee",
      reasonCodes: ["tool_source_unsupported"],
    })
  })

  it("rejects an exclusive method that is unavailable on the current channel", () => {
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:telegram",
      intake: intake(),
      registry,
      tools: [localOnlyTool],
      source: "telegram",
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "exclusive_method_unavailable",
      decision: { outcome: "input_required" },
    })
  })

  it("does not compose canonical policy with isolated tools", () => {
    const source = readFileSync("packages/core/src/runs/start.ts", "utf8")
    expect(source).not.toContain(
      "canonicalPolicyTools: toolDispatcher.getAll({ includeIsolated: true })",
    )
    expect(source).toContain("const canonicalPolicyTools = toolDispatcher.getAll()")
  })
})
