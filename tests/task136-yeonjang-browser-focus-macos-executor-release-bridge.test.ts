import { describe, expect, it } from "vitest"
import {
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  bridgeYeonjangBrowserFocusMacosExecutorResult,
  type YeonjangBrowserFocusMacosExecutorReleaseBridgeSkeleton,
} from "../packages/core/src/release/yeonjang-browser-focus-macos-executor-release-bridge.ts"

function target(overrides: {
  targetAlias?: string
  processName?: string
  title?: string
  url?: string
} = {}): YeonjangBrowserFocusTargetProjection {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: overrides.targetAlias ?? "업무 브라우저",
    processName: overrides.processName ?? "Google Chrome",
    title: overrides.title ?? "Private Admin Console",
    url: overrides.url ?? "https://example.test/admin?token=private",
    pid: 4401,
    windowId: "window-private",
    tabId: "tab-private",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function readySkeleton(): YeonjangBrowserFocusMacosExecutorReleaseBridgeSkeleton {
  return {
    status: "skeleton_ready",
    reasonCode: "macos_browser_focus_command_skeleton_ready",
    method: "browser.focus",
    platform: "macos",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: true,
    requiresFocusedTargetObservation: true,
    postCheckMode: "focused_target_observation_required",
    target: target(),
    auditOnlyFields: ["automationScriptText", "rawWindowTitle", "rawUrl"],
  }
}

function blockedSkeleton(): YeonjangBrowserFocusMacosExecutorReleaseBridgeSkeleton {
  return {
    status: "skeleton_blocked",
    reasonCode: "side_effect_authorization_required",
    method: "browser.focus",
    platform: "macos",
    executeOsFocusNow: false,
    commandAccepted: false,
    requiresApproval: true,
    requiresFocusedTargetObservation: true,
    postCheckMode: "focused_target_observation_required",
    auditOnlyFields: ["automationScriptText", "rawWindowTitle", "rawUrl"],
  }
}

describe("Task 136 Yeonjang browser.focus macOS executor release bridge", () => {
  it("keeps accepted executor results manual until focused target observation exists", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: true,
        reasonCode: "macos_browser_focus_command_accepted",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
    })

    expect(bridge).toMatchObject({
      status: "bridge_manual_intervention",
      reasonCode: "target_observation_required",
      postCheckState: "MANUAL_INTERVENTION",
      executorReasonCode: "macos_browser_focus_command_accepted",
      commandAccepted: true,
      goalSuccess: false,
      addProductionBindingNow: false,
      dispatcherRegistrationNow: false,
    })
  })

  it("maps runner rejection to failed command without treating it as user goal success", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: false,
        reasonCode: "macos_browser_focus_command_rejected",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
      observedFocusedTarget: target(),
    })

    expect(bridge).toMatchObject({
      status: "bridge_failed",
      reasonCode: "browser_focus_command_failed",
      postCheckState: "FAILED",
      executorReasonCode: "macos_browser_focus_command_rejected",
      commandAccepted: false,
      goalSuccess: false,
    })
  })

  it("maps runner failure to failed command without leaking raw failure data", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: false,
        reasonCode: "macos_browser_focus_command_failed",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
      auditOnlyDetails: {
        runnerError: "private osascript stack trace",
        automationScriptText: "tell application \"Google Chrome\" to activate",
      },
    })

    expect(bridge).toMatchObject({
      status: "bridge_failed",
      reasonCode: "browser_focus_command_failed",
      executorReasonCode: "macos_browser_focus_command_failed",
    })
    expect(JSON.stringify(bridge)).not.toMatch(/private osascript|tell application|automationScriptText/u)
  })

  it("blocks before executor result when command skeleton is not ready", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: blockedSkeleton(),
      executorResult: {
        commandAccepted: true,
        reasonCode: "macos_browser_focus_command_accepted",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
    })

    expect(bridge).toMatchObject({
      status: "bridge_blocked",
      reasonCode: "command_skeleton_not_ready",
      postCheckState: "BLOCKED",
      executorReasonCode: "not_invoked",
      commandAccepted: false,
      goalSuccess: false,
    })
  })

  it("keeps observation mismatch in manual intervention", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: true,
        reasonCode: "macos_browser_focus_command_accepted",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
      observedFocusedTarget: target({
        targetAlias: "다른 브라우저",
        processName: "Safari",
        title: "Different Page",
        url: "https://other.example.test",
      }),
    })

    expect(bridge).toMatchObject({
      status: "bridge_manual_intervention",
      reasonCode: "focused_target_mismatch",
      postCheckState: "MANUAL_INTERVENTION",
      commandAccepted: true,
      goalSuccess: false,
    })
  })

  it("verifies only after command acceptance and focused target match", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: true,
        reasonCode: "macos_browser_focus_command_accepted",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
      observedFocusedTarget: target(),
    })

    expect(bridge).toMatchObject({
      status: "bridge_verified",
      reasonCode: "focused_target_matched",
      postCheckState: "VERIFIED",
      executorReasonCode: "macos_browser_focus_command_accepted",
      commandAccepted: true,
      goalSuccess: true,
      addProductionBindingNow: false,
      dispatcherRegistrationNow: false,
    })
  })

  it("does not expose raw target, automation, or internal instance data in public bridge output", () => {
    const bridge = bridgeYeonjangBrowserFocusMacosExecutorResult({
      skeleton: readySkeleton(),
      executorResult: {
        commandAccepted: true,
        reasonCode: "macos_browser_focus_command_accepted",
        focusedTargetObservationRequired: true,
        goalSuccess: false,
      },
      observedFocusedTarget: target(),
      auditOnlyDetails: {
        automationScriptText: "tell application \"Google Chrome\" to activate",
        rawUrl: "https://example.test/admin?token=private",
        internalInstanceId: "private-instance",
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    })

    expect(JSON.stringify(bridge)).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|private-instance|tell application|4401|window-private|tab-private|automationScriptText|rawUrl/u,
    )
  })
})

