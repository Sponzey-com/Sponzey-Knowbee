import { describe, expect, it } from "vitest"
import {
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import type { YeonjangBrowserFocusMacosExecutorReleaseBridge } from "../packages/core/src/release/yeonjang-browser-focus-macos-executor-release-bridge.ts"
import type {
  YeonjangBrowserFocusApprovalReceipt,
  YeonjangBrowserFocusPreDispatchDecision,
} from "../packages/core/src/release/yeonjang-browser-focus-pre-dispatch-fixture.ts"
import {
  buildYeonjangBrowserFocusToolBindingPlan,
  type YeonjangBrowserFocusToolBindingDescriptor,
} from "../packages/core/src/release/yeonjang-browser-focus-tool-binding-plan.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

function target(): YeonjangBrowserFocusTargetProjection {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Admin Console",
    url: "https://example.test/admin?token=private",
    pid: 4401,
    windowId: "window-private",
    tabId: "tab-private",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function descriptor(overrides: Partial<YeonjangBrowserFocusToolBindingDescriptor> = {}): YeonjangBrowserFocusToolBindingDescriptor {
  return {
    toolName: "yeonjang_browser_focus",
    method: "browser.focus",
    riskLevel: "moderate",
    requiresApproval: true,
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.focus"],
    sideEffectMethodContractBound: true,
    requiresPreDispatchFixture: true,
    requiresMacosBridgeVerified: true,
    rawPayloadVisibility: "audit_only",
    targetSchemaVersion: "yeonjang-browser-focus-target-v1",
    ...overrides,
  }
}

function approval(overrides: Partial<YeonjangBrowserFocusApprovalReceipt> = {}): YeonjangBrowserFocusApprovalReceipt {
  return {
    method: "browser.focus",
    decision: "allow_once",
    scopeId: "request-scope-public",
    approved: true,
    ...overrides,
  }
}

function preDispatch(status: "dispatch_prepared" | "dispatch_blocked" = "dispatch_prepared"): YeonjangBrowserFocusPreDispatchDecision {
  if (status === "dispatch_blocked") {
    return {
      schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      platform: "macos",
      status: "dispatch_blocked",
      reasonCode: "macos_bridge_not_verified",
      invokeNow: false,
      addProductionBindingNow: false,
      dispatcherRegistrationNow: false,
      blockedBy: "target_observation_required",
    }
  }
  return {
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "dispatch_prepared",
    reasonCode: "browser_focus_dispatch_prepared",
    invokeNow: false,
    addProductionBindingNow: false,
    dispatcherRegistrationNow: false,
    target: target(),
    approvalScopeId: "request-scope-public",
    macosBridgeStatus: "bridge_verified",
  }
}

function macosBridge(status: "bridge_verified" | "bridge_manual_intervention" = "bridge_verified"): YeonjangBrowserFocusMacosExecutorReleaseBridge {
  const projectedTarget = target()
  if (status === "bridge_manual_intervention") {
    return {
      schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      platform: "macos",
      status: "bridge_manual_intervention",
      reasonCode: "target_observation_required",
      postCheckState: "MANUAL_INTERVENTION",
      executorReasonCode: "macos_browser_focus_command_accepted",
      commandAccepted: true,
      goalSuccess: false,
      addProductionBindingNow: false,
      dispatcherRegistrationNow: false,
      expectedTarget: projectedTarget,
    }
  }
  return {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "bridge_verified",
    reasonCode: "focused_target_matched",
    postCheckState: "VERIFIED",
    executorReasonCode: "macos_browser_focus_command_accepted",
    commandAccepted: true,
    goalSuccess: true,
    addProductionBindingNow: false,
    dispatcherRegistrationNow: false,
    expectedTarget: projectedTarget,
    observedFocusedTarget: projectedTarget,
  }
}

describe("Task 138 Yeonjang browser.focus tool binding plan", () => {
  it("requires descriptor shape to match browser.focus side-effect binding rules", () => {
    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor({ requiresApproval: false }),
      target: target(),
      approvalReceipt: approval(),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "descriptor_contract_mismatch",
    })
  })

  it("requires target, approval, and pre-dispatch fixture", () => {
    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: undefined,
      approvalReceipt: approval(),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "target_identity_required",
    })

    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval({ approved: false, decision: "deny" }),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "side_effect_authorization_required",
    })

    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval(),
      preDispatch: preDispatch("dispatch_blocked"),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "pre_dispatch_not_ready",
      blockedBy: "macos_bridge_not_verified",
    })
  })

  it("requires macOS bridge verified receipt and Yeonjang capability readiness", () => {
    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval(),
      preDispatch: preDispatch(),
      macosBridge: macosBridge("bridge_manual_intervention"),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "macos_bridge_not_verified",
      blockedBy: "target_observation_required",
    })

    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval(),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: false,
    })).toMatchObject({
      status: "binding_plan_blocked",
      reasonCode: "yeonjang_capability_not_ready",
    })
  })

  it("returns a non-registered binding plan only after all gates are ready", () => {
    expect(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval(),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
    })).toMatchObject({
      status: "binding_plan_ready",
      reasonCode: "browser_focus_tool_binding_plan_ready",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      addProductionBindingNow: false,
      registerSkillCatalogNow: false,
      dispatcherRegistrationNow: false,
      invokeNow: false,
    })
  })

  it("does not expose raw payload, approval raw detail, or audit-only field names", () => {
    const output = JSON.stringify(buildYeonjangBrowserFocusToolBindingPlan({
      descriptor: descriptor(),
      target: target(),
      approvalReceipt: approval({
        rawReceiptPayload: {
          rawUrl: "https://example.test/admin?token=private",
          internalInstanceId: "private-instance",
          automationScriptText: "tell application \"Google Chrome\" to activate",
        },
      }),
      preDispatch: preDispatch(),
      macosBridge: macosBridge(),
      yeonjangCapabilityReady: true,
      auditOnlyDetails: {
        rawTitle: "Private Admin Console",
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|private-instance|tell application|4401|window-private|tab-private|rawReceiptPayload|automationScriptText|rawTitle|rawUrl|auditOnlyFields/u,
    )
  })

  it("keeps the actual production mapping and Skill catalog closed in this task", () => {
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })
})

