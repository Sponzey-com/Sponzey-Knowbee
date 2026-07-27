import { describe, expect, it } from "vitest"
import {
  evaluateYeonjangBrowserFocusPostCheck,
  evaluateYeonjangBrowserFocusPreflight,
  projectYeonjangBrowserFocusTarget,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { projectYeonjangRuntimeHealthObservations } from "../packages/core/src/runs/runtime-capability-health.ts"
import type { AnyTool } from "../packages/core/src/tools/types.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"

const browserFocusTool = {
  name: "yeonjang_browser_focus",
  description: "Focus a remote Yeonjang browser window.",
  parameters: { type: "object", properties: {} },
  riskLevel: "moderate",
  requiresApproval: true,
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.focus"],
  execute: async () => ({ success: false, output: "not implemented" }),
} as AnyTool

const office = {
  instanceId: "office",
  runnableTarget: true,
  runnableReasonCodes: [],
} as YeonjangRegistryInstanceView

function target() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Dashboard",
    url: "https://example.test/dashboard?token=private",
    pid: 1234,
    windowId: "window-private",
    tabId: "tab-private",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("test target projection failed")
  return projected.projection
}

describe("Task 113 Yeonjang browser.focus preflight", () => {
  it("marks browser.focus unavailable when a target Yeonjang snapshot lacks the method", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office],
      tools: [browserFocusTool],
      methodSnapshots: [{ instanceId: "office", methods: ["browser.open_url"] }],
      observedAt: 113,
    })

    expect(observations).toEqual([{
      capabilityId: "yeonjang_browser_focus",
      targetId: "yeonjang:office",
      status: "unavailable",
      observedAt: 113,
      expiresAt: 113,
      reasonCodes: ["yeonjang_method_unsupported"],
    }])
    expect(evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: false,
      approvalGranted: true,
      target: target(),
    })).toMatchObject({
      status: "blocked",
      reasonCode: "capability_not_supported",
      method: "browser.focus",
    })
  })

  it("blocks browser.focus before execution when approval is missing even if the method exists", () => {
    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [office],
      tools: [browserFocusTool],
      methodSnapshots: [{ instanceId: "office", methods: ["browser.focus"] }],
      observedAt: 113,
    })

    expect(observations).toEqual([expect.objectContaining({
      capabilityId: "yeonjang_browser_focus",
      targetId: "yeonjang:office",
      status: "ready",
      reasonCodes: [],
    })])
    expect(evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: true,
      approvalGranted: false,
      target: target(),
    })).toMatchObject({
      status: "blocked",
      reasonCode: "side_effect_authorization_required",
      method: "browser.focus",
    })
  })

  it("requires focused target observation after approval and does not leak raw target data", () => {
    const preflight = evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: true,
      approvalGranted: true,
      target: target(),
    })

    expect(preflight).toMatchObject({
      status: "ready",
      reasonCode: "browser_focus_preflight_ready",
      method: "browser.focus",
    })
    const postCheck = evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: true,
      expectedTarget: preflight.target,
    })
    expect(postCheck).toMatchObject({
      state: "MANUAL_INTERVENTION",
      reasonCode: "target_observation_required",
    })
    const serialized = JSON.stringify({ preflight, postCheck })
    expect(serialized).not.toContain("Private Dashboard")
    expect(serialized).not.toContain("https://example.test")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("1234")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
  })
})
