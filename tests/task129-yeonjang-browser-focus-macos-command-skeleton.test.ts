import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  evaluateYeonjangBrowserFocusPostCheck,
  evaluateYeonjangBrowserFocusPreflight,
  projectYeonjangBrowserFocusTarget,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  buildYeonjangBrowserFocusMacosCommandSkeleton,
} from "../packages/core/src/release/yeonjang-browser-focus-macos-command-skeleton.ts"

function target() {
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

function preflight(approvalGranted = true) {
  return evaluateYeonjangBrowserFocusPreflight({
    capabilitySupported: true,
    approvalGranted,
    target: target(),
  })
}

function commandContract() {
  return buildYeonjangBrowserFocusCommandContract({
    platform: "macos",
    desktopSession: "available",
    commandBackendAvailable: true,
    observationBackendAvailable: true,
    admission: {
      status: "admitted",
      reasonCode: "browser_focus_admission_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
      selectableTargets: [{
        publicTargetName: "Office Mac",
        platform: "macos",
        method: "browser.focus",
        requiresApproval: true,
        permissionSetting: "allow_browser_control",
      }],
    },
    target: target(),
    automationPlan: "osascript private browser focus",
  })
}

describe("Task 129 Yeonjang browser.focus macOS command skeleton", () => {
  it("builds a macOS backend command skeleton without performing OS focus or marking command accepted", () => {
    const skeleton = buildYeonjangBrowserFocusMacosCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "osascript private browser focus",
    })

    expect(skeleton).toEqual({
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
      auditOnlyFields: [
        "rawWindowTitle",
        "rawUrl",
        "queryToken",
        "pid",
        "windowId",
        "tabId",
        "automationScriptText",
      ],
    })
  })

  it("blocks the skeleton before command planning when approval preflight is not ready", () => {
    expect(buildYeonjangBrowserFocusMacosCommandSkeleton({
      target: target(),
      preflight: preflight(false),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "osascript private browser focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "side_effect_authorization_required",
      executeOsFocusNow: false,
      commandAccepted: false,
    })
  })

  it("keeps command accepted separate from focused target post-check verification", () => {
    const skeleton = buildYeonjangBrowserFocusMacosCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "osascript private browser focus",
    })

    expect(skeleton.commandAccepted).toBe(false)
    expect(evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: skeleton.commandAccepted,
      expectedTarget: target(),
      observedFocusedTarget: target(),
    })).toMatchObject({
      state: "FAILED",
      reasonCode: "browser_focus_command_failed",
    })
    expect(evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: true,
      expectedTarget: target(),
    })).toMatchObject({
      state: "MANUAL_INTERVENTION",
      reasonCode: "target_observation_required",
    })
  })

  it("does not expose raw target or automation data", () => {
    const output = JSON.stringify(buildYeonjangBrowserFocusMacosCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "osascript private browser focus",
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|osascript private/u,
    )
  })
})
