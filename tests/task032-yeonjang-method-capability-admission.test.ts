import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import { projectYeonjangRuntimeHealthObservations } from "../packages/core/src/runs/runtime-capability-health.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"

const shellTool = {
  name: "shell_exec",
  description: "Execute a command locally or through Yeonjang",
  parameters: { type: "object", properties: {} },
  riskLevel: "dangerous",
  requiresApproval: true,
  runtimeHealthMode: "additional",
  runtimeMethodIds: ["system.exec"],
  execute: async () => ({ success: true, output: "done" }),
} as AnyTool

const office = {
  instanceId: "office",
  runnableTarget: true,
  runnableReasonCodes: [],
} as YeonjangRegistryInstanceView

const registry = {
  generatedAt: 1,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

function exactIntake(targetId: string): TaskIntakeResult {
  return {
    action_items: [
      {
        id: "action:1",
        type: "run_task",
        title: "Run command on the selected Yeonjang",
        priority: "normal",
        reason: "requested",
        payload: {
          preferred_methods: ["shell_exec"],
          exclusive_methods: ["shell_exec"],
          target_instance: targetId,
        },
      },
    ],
  } as TaskIntakeResult
}

describe("Task 032 Yeonjang method capability admission", () => {
  it("rejects missing or duplicate transport method declarations", () => {
    expect(() =>
      projectYeonjangRuntimeHealthObservations({
        instances: [office],
        tools: [{ ...shellTool, runtimeMethodIds: [] }],
        methodSnapshots: [],
        observedAt: 1_000,
      }),
    ).toThrow(/runtime method ids are required/i)
    expect(() =>
      projectYeonjangRuntimeHealthObservations({
        instances: [office],
        tools: [{ ...shellTool, runtimeMethodIds: ["system.exec", "system.exec"] }],
        methodSnapshots: [],
        observedAt: 1_000,
      }),
    ).toThrow(/duplicate yeonjang runtime method id/i)
  })

  it("rejects duplicate method snapshots for one instance identity", () => {
    expect(() =>
      projectYeonjangRuntimeHealthObservations({
        instances: [office],
        tools: [shellTool],
        methodSnapshots: [
          { instanceId: "office", methods: ["system.exec"] },
          { instanceId: "office", methods: ["screen.capture"] },
        ],
        observedAt: 1_000,
      }),
    ).toThrow(/duplicate yeonjang method snapshot/i)
  })

  it("does not advertise a connected target that lacks the declared transport method", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office],
      tools: [shellTool],
      methodSnapshots: [{ instanceId: "office", methods: ["screen.capture"] }],
      observedAt: 1_000,
    })

    expect(observations).toEqual([
      {
        capabilityId: "shell_exec",
        targetId: "yeonjang:office",
        status: "unavailable",
        observedAt: 1_000,
        expiresAt: 1_000,
        reasonCodes: ["yeonjang_method_unsupported"],
      },
    ])
  })

  it("advertises only the exact instance whose method snapshot supports the tool", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office, { ...office, instanceId: "home" }],
      tools: [shellTool],
      methodSnapshots: [
        { instanceId: "office", methods: ["screen.capture"] },
        { instanceId: "home", methods: ["system.exec"] },
      ],
      observedAt: 1_000,
    })

    expect(observations.map((item) => [item.targetId, item.status])).toEqual([
      ["yeonjang:office", "unavailable"],
      ["yeonjang:home", "ready"],
    ])
  })

  it("does not advertise a method whose exact runtime permission is disabled", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office],
      tools: [shellTool],
      methodSnapshots: [{
        instanceId: "office",
        methods: ["system.exec"],
        toolHealth: {
          "system.exec": { status: "permission_disabled", internalDetail: "private" },
        },
      }],
      observedAt: 1_000,
    })

    expect(observations).toEqual([
      {
        capabilityId: "shell_exec",
        targetId: "yeonjang:office",
        status: "unavailable",
        observedAt: 1_000,
        expiresAt: 1_000,
        reasonCodes: ["yeonjang_method_permission_disabled"],
      },
    ])
    expect(JSON.stringify(observations)).not.toContain("private")
  })

  it("does not substitute another method-capable instance for an exact target", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office, { ...office, instanceId: "home" }],
      tools: [shellTool],
      methodSnapshots: [
        { instanceId: "office", methods: ["screen.capture"] },
        { instanceId: "home", methods: ["system.exec"] },
      ],
      observedAt: 1_000,
    })
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:exact-method",
      intake: exactIntake("yeonjang:office"),
      registry,
      tools: [shellTool],
      snapshotAt: 1_000,
      runtimeHealthObservations: observations,
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "target_binding_unavailable",
      decision: { outcome: "input_required" },
    })
  })

  it("keeps local-only app listing free of Yeonjang runtime metadata", () => {
    const source = readFileSync("packages/core/src/tools/builtin/app.ts", "utf8")
    const appListSource = source.slice(source.indexOf("export const appListTool"))
    expect(appListSource).not.toContain('runtimeHealthMode: "additional"')
    expect(appListSource).not.toContain("runtimeMethodIds")
  })
})
