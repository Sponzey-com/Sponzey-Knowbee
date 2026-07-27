import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  evaluateYeonjangBrowserFocusPreflight,
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusReadinessPlatform,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  buildYeonjangBrowserFocusLinuxCommandSkeleton,
} from "../packages/core/src/release/yeonjang-browser-focus-linux-command-skeleton.ts"

function target() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "리눅스 업무 브라우저",
    processName: "firefox",
    title: "Private Linux Console",
    url: "https://example.test/linux?token=private",
    pid: 6012,
    windowId: "x11-window-private",
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

function commandContract(input: {
  platform?: YeonjangBrowserFocusReadinessPlatform
  desktopSession?: "available" | "headless" | "unknown"
  commandBackendAvailable?: boolean
  observationBackendAvailable?: boolean
} = {}) {
  return buildYeonjangBrowserFocusCommandContract({
    platform: input.platform ?? "linux",
    desktopSession: input.desktopSession ?? "available",
    commandBackendAvailable: input.commandBackendAvailable ?? true,
    observationBackendAvailable: input.observationBackendAvailable ?? true,
    admission: {
      status: "admitted",
      reasonCode: "browser_focus_admission_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
      selectableTargets: [{
        publicTargetName: "Office Linux",
        platform: "linux",
        method: "browser.focus",
        requiresApproval: true,
        permissionSetting: "allow_browser_control",
      }],
    },
    target: target(),
    automationPlan: "xdotool private wmctrl focus",
  })
}

describe("Task 131 Yeonjang browser.focus Linux command skeleton", () => {
  it("builds a Linux desktop command skeleton without executing focus or marking command accepted", () => {
    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toEqual({
      status: "skeleton_ready",
      reasonCode: "linux_browser_focus_command_skeleton_ready",
      method: "browser.focus",
      platform: "linux",
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
        "xdotoolScriptText",
        "wmctrlScriptText",
        "waylandPortalRequest",
      ],
    })
  })

  it("blocks before command planning when browser control approval is missing", () => {
    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(false),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "side_effect_authorization_required",
      executeOsFocusNow: false,
      commandAccepted: false,
    })
  })

  it("keeps Linux command backend and focused target observation backend failures distinct", () => {
    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ commandBackendAvailable: false }),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "command_backend_required",
    })

    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ observationBackendAvailable: false }),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "focused_target_observation_backend_required",
    })
  })

  it("blocks Linux headless and unknown platform states with public reason codes", () => {
    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ desktopSession: "headless" }),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "headless_unavailable",
    })

    expect(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ platform: "unknown" }),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "platform_not_linux",
    })
  })

  it("does not expose raw Linux focus data and does not add Linux backend implementation yet", () => {
    const linuxSource = readFileSync("Yeonjang/src/platform/linux.rs", "utf8")
    const output = JSON.stringify(buildYeonjangBrowserFocusLinuxCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "xdotool private wmctrl focus",
    }))

    expect(output).not.toMatch(
      /Private Linux Console|https:\/\/example\.test|token=private|6012|x11-window-private|tab-private|xdotool private|wmctrl focus/u,
    )
    expect(linuxSource).not.toContain("focus_browser")
    expect(linuxSource).not.toContain("browser_focus")
  })
})
