import { describe, expect, it } from "vitest"
import {
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import type { YeonjangBrowserFocusMacosExecutorReleaseBridge } from "../packages/core/src/release/yeonjang-browser-focus-macos-executor-release-bridge.ts"
import {
  prepareYeonjangBrowserFocusPreDispatch,
  type YeonjangBrowserFocusApprovalReceipt,
} from "../packages/core/src/release/yeonjang-browser-focus-pre-dispatch-fixture.ts"
import type { YeonjangBrowserFocusRegistrationPreconditionDecision } from "../packages/core/src/release/yeonjang-browser-focus-registration-precondition.ts"
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

function approval(overrides: Partial<YeonjangBrowserFocusApprovalReceipt> = {}): YeonjangBrowserFocusApprovalReceipt {
  return {
    method: "browser.focus",
    decision: "allow_once",
    scopeId: "request-scope-public",
    approved: true,
    ...overrides,
  }
}

function registrationReady(): YeonjangBrowserFocusRegistrationPreconditionDecision {
  return {
    status: "registration_ready",
    reasonCode: "browser_focus_dispatcher_registration_ready",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    registerDispatcherNow: false,
    releaseGateStatus: "ready",
    exposureStatus: "executable",
    bindingReadinessStatus: "ready_for_binding",
    bindingDesignStatus: "binding_design_ready",
    requiredPreconditions: [
      "release_gate",
      "production_exposure",
      "binding_readiness",
      "binding_design",
    ],
  }
}

function registrationBlocked(): YeonjangBrowserFocusRegistrationPreconditionDecision {
  return {
    status: "registration_blocked",
    reasonCode: "production_exposure_not_executable",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    registerDispatcherNow: false,
    releaseGateStatus: "ready",
    exposureStatus: "not_executable",
    bindingReadinessStatus: "ready_for_binding",
    bindingDesignStatus: "binding_design_ready",
    blockedBy: "tool_mapping_not_registered",
  }
}

function bridge(status: "bridge_verified" | "bridge_manual_intervention" = "bridge_verified"): YeonjangBrowserFocusMacosExecutorReleaseBridge {
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

describe("Task 137 Yeonjang browser.focus pre-dispatch fixture", () => {
  it("blocks when target identity is missing", () => {
    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: undefined,
      approvalReceipt: approval(),
      registrationPrecondition: registrationReady(),
      macosBridge: bridge(),
    })).toMatchObject({
      status: "dispatch_blocked",
      reasonCode: "target_identity_required",
      invokeNow: false,
    })
  })

  it("blocks when side-effect approval receipt is missing or not allowed", () => {
    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: undefined,
      registrationPrecondition: registrationReady(),
      macosBridge: bridge(),
    })).toMatchObject({
      status: "dispatch_blocked",
      reasonCode: "side_effect_authorization_required",
    })

    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: approval({ approved: false, decision: "deny" }),
      registrationPrecondition: registrationReady(),
      macosBridge: bridge(),
    })).toMatchObject({
      status: "dispatch_blocked",
      reasonCode: "side_effect_authorization_required",
    })
  })

  it("blocks when production readiness is not ready", () => {
    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: approval(),
      registrationPrecondition: registrationBlocked(),
      macosBridge: bridge(),
    })).toMatchObject({
      status: "dispatch_blocked",
      reasonCode: "readiness_not_ready",
      blockedBy: "tool_mapping_not_registered",
    })
  })

  it("blocks when macOS bridge still requires manual intervention", () => {
    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: approval(),
      registrationPrecondition: registrationReady(),
      macosBridge: bridge("bridge_manual_intervention"),
    })).toMatchObject({
      status: "dispatch_blocked",
      reasonCode: "macos_bridge_not_verified",
      blockedBy: "target_observation_required",
    })
  })

  it("prepares dispatch only after target, approval, readiness, and macOS bridge verification", () => {
    expect(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: approval(),
      registrationPrecondition: registrationReady(),
      macosBridge: bridge(),
    })).toMatchObject({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_prepared",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      platform: "macos",
      invokeNow: false,
      addProductionBindingNow: false,
      dispatcherRegistrationNow: false,
    })
  })

  it("does not expose raw payload, internal instance, or approval raw detail", () => {
    const output = JSON.stringify(prepareYeonjangBrowserFocusPreDispatch({
      target: target(),
      approvalReceipt: approval({
        rawReceiptPayload: {
          rawUrl: "https://example.test/admin?token=private",
          internalInstanceId: "private-instance",
          automationScriptText: "tell application \"Google Chrome\" to activate",
        },
      }),
      registrationPrecondition: registrationReady(),
      macosBridge: bridge(),
      auditOnlyDetails: {
        rawTitle: "Private Admin Console",
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|private-instance|tell application|4401|window-private|tab-private|rawReceiptPayload|automationScriptText|rawTitle|rawUrl/u,
    )
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })
})

