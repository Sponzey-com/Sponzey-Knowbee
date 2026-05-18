import { describe, expect, it } from "vitest"
import { planYeonjangBroadcastRun, buildYeonjangBroadcastAggregateSummary } from "../packages/core/src/yeonjang/broadcast.ts"
import { buildYeonjangBroadcastPolicyProjection } from "../packages/core/src/yeonjang/broadcast-policy.ts"
import type { MqttExtensionSnapshot } from "../packages/core/src/mqtt/broker.ts"
import { projectYeonjangInstances } from "../packages/core/src/yeonjang/topology.ts"

function snapshot(overrides: Partial<MqttExtensionSnapshot>): MqttExtensionSnapshot {
  return {
    extensionId: overrides.extensionId ?? "yeonjang-main",
    clientId: overrides.clientId ?? "client-1",
    displayName: overrides.displayName ?? "Yeonjang",
    instanceId: overrides.instanceId ?? "inst-1",
    instanceAlias: overrides.instanceAlias ?? "node-1",
    nodeId: overrides.nodeId ?? overrides.extensionId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    state: overrides.state ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    buildTarget: overrides.buildTarget ?? "darwin-arm64",
    platform: overrides.platform ?? "macos",
    os: overrides.os ?? overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    methods: overrides.methods ?? ["screen.capture"],
    sessionId: overrides.sessionId ?? "sess-1",
    trustState: overrides.trustState ?? "trusted",
    transport: overrides.transport ?? ["mqtt-json"],
    lastSeenAt: overrides.lastSeenAt ?? Date.now(),
  }
}

describe("task004 yeonjang broadcast planning", () => {
  it("expands all_online only for trusted online instances that satisfy the required capability", () => {
    const now = Date.now()
    const result = planYeonjangBroadcastRun({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
      snapshots: [
        snapshot({
          extensionId: "yeonjang-main",
          instanceId: "inst-local",
          instanceAlias: "local-mac",
          displayName: "Local Mac",
          methods: ["screen.capture", "system.exec"],
          sessionId: "sess-local",
          lastSeenAt: now,
        }),
        snapshot({
          extensionId: "yeonjang-pending",
          instanceId: "inst-pending",
          instanceAlias: "pending-win",
          displayName: "Pending Windows",
          trustState: "pending",
          methods: ["screen.capture"],
          sessionId: "sess-pending",
          lastSeenAt: now,
        }),
        snapshot({
          extensionId: "yeonjang-offline",
          instanceId: "inst-offline",
          instanceAlias: "offline-linux",
          displayName: "Offline Linux",
          state: "offline",
          methods: ["screen.capture"],
          sessionId: "sess-offline",
          lastSeenAt: now,
        }),
        snapshot({
          extensionId: "yeonjang-no-screen",
          instanceId: "inst-no-screen",
          instanceAlias: "exec-only",
          displayName: "Exec Only",
          methods: ["system.exec"],
          sessionId: "sess-exec",
          lastSeenAt: now,
        }),
      ],
      now,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.targets).toEqual([
      expect.objectContaining({
        instanceId: "inst-local",
        extensionId: "yeonjang-main",
        sessionId: "sess-local",
        requiredMethods: ["screen.capture"],
      }),
    ])
    expect(result.plan.trace.plannedTargetIds).toEqual(["inst-local"])
    expect(result.plan.skippedTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ instanceId: "inst-pending", reasonCodes: expect.arrayContaining(["target_trust_pending"]) }),
      expect.objectContaining({ instanceId: "inst-no-screen", reasonCodes: expect.arrayContaining(["required_capability_missing"]) }),
    ]))
  })

  it("refuses to expand a broadcast selector without explicit broadcast intent", () => {
    const result = planYeonjangBroadcastRun({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      snapshots: [snapshot({ extensionId: "yeonjang-main", instanceId: "inst-local" })],
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      code: "missing_broadcast_intent",
    }))
  })

  it("builds aggregate summary for partial success without losing per-target failures", () => {
    const summary = buildYeonjangBroadcastAggregateSummary({
      broadcastRunId: "broadcast-1",
      records: [
        {
          status: "succeeded",
          broadcastIndex: 0,
          instanceId: "inst-a",
          extensionId: "yeonjang-a",
          sessionId: "sess-a",
          instanceAlias: "node-a",
          displayName: "Node A",
          reasonCodes: ["broadcast_target_succeeded"],
        },
        {
          status: "failed",
          broadcastIndex: 1,
          instanceId: "inst-b",
          extensionId: "yeonjang-b",
          sessionId: "sess-b",
          instanceAlias: "node-b",
          displayName: "Node B",
          reasonCodes: ["YEONJANG_SCREEN_CAPTURE_TIMEOUT"],
        },
      ],
      skippedTargets: [
        {
          instanceId: "inst-c",
          extensionId: "yeonjang-c",
          instanceAlias: "node-c",
          displayName: "Node C",
          reasonCodes: ["target_trust_pending"],
        },
      ],
      retryTrace: {
        requested: true,
        retryMode: "failed_only",
        previousBroadcastRunId: "broadcast-0",
        previousTargetCount: 3,
        previousSucceededCount: 1,
        previousIncompleteCount: 2,
        skippedSucceededTargetIds: ["inst-a"],
        skippedUnknownTargetIds: [],
        retriedTargetIds: ["inst-b", "inst-c"],
      },
    })

    expect(summary).toEqual({
      broadcastRunId: "broadcast-1",
      totalTargets: 3,
      successCount: 1,
      failedCount: 1,
      skippedCount: 1,
      partialSuccess: true,
      reasonCodes: ["YEONJANG_SCREEN_CAPTURE_TIMEOUT", "broadcast_target_succeeded", "target_trust_pending"],
      retryRequested: true,
      retrySkippedSucceededCount: 1,
      retrySkippedUnknownCount: 0,
      retryTargetCount: 2,
    })
  })

  it("plans broadcast partial retry without re-including already succeeded or newly appeared targets", () => {
    const now = Date.now()
    const retrySnapshots = [
      snapshot({
        extensionId: "yeonjang-local",
        instanceId: "inst-local",
        instanceAlias: "local-mac",
        displayName: "Local Mac",
        sessionId: "sess-local",
        lastSeenAt: now,
      }),
      snapshot({
        extensionId: "yeonjang-win",
        instanceId: "inst-win",
        instanceAlias: "windows-box",
        displayName: "Windows Box",
        sessionId: "sess-win-2",
        lastSeenAt: now,
        platform: "windows",
        os: "windows",
        arch: "x64",
      }),
      snapshot({
        extensionId: "yeonjang-linux",
        instanceId: "inst-linux",
        instanceAlias: "linux-box",
        displayName: "Linux Box",
        sessionId: "sess-linux",
        lastSeenAt: now,
        platform: "linux",
        os: "linux",
        arch: "x64",
      }),
      snapshot({
        extensionId: "yeonjang-new",
        instanceId: "inst-new",
        instanceAlias: "new-box",
        displayName: "New Box",
        sessionId: "sess-new",
        lastSeenAt: now,
        platform: "windows",
        os: "windows",
        arch: "x64",
      }),
    ]
    const retryInstances = projectYeonjangInstances({ snapshots: retrySnapshots, now }).map((instance) => {
      if (instance.instanceId === "inst-local") return instance
      return {
        ...instance,
        workspaceScopeId: "workspace:local-default",
        scopeAccess: "allowed" as const,
        trustState: "trusted" as const,
        trustReason: "test_retry_receipt",
        runnableTarget: true,
        runnableReasonCodes: [],
      }
    })
    const result = planYeonjangBroadcastRun({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
      retryReceipt: {
        previousBroadcastRunId: "broadcast-prev",
        retryMode: "failed_only",
        targetReceipts: [
          { instanceId: "inst-local", status: "succeeded", sessionId: "sess-local" },
          { instanceId: "inst-win", status: "failed", sessionId: "sess-win" },
        ],
        skippedTargets: [
          { instanceId: "inst-linux", reasonCodes: ["temporary_preflight_failure"] },
        ],
      },
      snapshots: retrySnapshots,
      instances: retryInstances,
      now,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.targets.map((item) => item.instanceId)).toEqual(["inst-win", "inst-linux"])
    expect(result.plan.skippedTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        instanceId: "inst-local",
        reasonCodes: expect.arrayContaining(["retry_target_already_succeeded"]),
      }),
      expect.objectContaining({
        instanceId: "inst-new",
        reasonCodes: expect.arrayContaining(["retry_target_not_in_previous_receipt"]),
      }),
    ]))
    expect(result.plan.trace.retryReceipt).toEqual({
      requested: true,
      retryMode: "failed_only",
      previousBroadcastRunId: "broadcast-prev",
      previousTargetCount: 3,
      previousSucceededCount: 1,
      previousIncompleteCount: 2,
      skippedSucceededTargetIds: ["inst-local"],
      skippedUnknownTargetIds: ["inst-new"],
      retriedTargetIds: ["inst-win", "inst-linux"],
    })
  })

  it("projects broadcast-safe and blocked tool counts for UI preflight", () => {
    const projection = buildYeonjangBroadcastPolicyProjection()

    expect(projection.summary).toEqual({
      totalTools: 5,
      broadcastSafeTools: 2,
      blockedTools: 3,
      approvalRequiredTools: 3,
    })
    expect(projection.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolName: "screen_capture",
        broadcastSafe: true,
        targetRequirement: "trusted_only",
      }),
      expect.objectContaining({
        toolName: "shell_exec",
        broadcastSafe: false,
        approvalRequired: true,
      }),
    ]))
  })
})
