import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  evaluateYeonjangBrowserFocusPreflight,
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusReadinessPlatform,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  buildYeonjangBrowserFocusWindowsCommandSkeleton,
} from "../packages/core/src/release/yeonjang-browser-focus-windows-command-skeleton.ts"

function target() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "msedge.exe",
    title: "Private Trading Dashboard",
    url: "https://example.test/market?token=private",
    pid: 5024,
    windowId: "hwnd-private",
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
    platform: input.platform ?? "windows",
    desktopSession: input.desktopSession ?? "available",
    commandBackendAvailable: input.commandBackendAvailable ?? true,
    observationBackendAvailable: input.observationBackendAvailable ?? true,
    admission: {
      status: "admitted",
      reasonCode: "browser_focus_admission_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
      selectableTargets: [{
        publicTargetName: "Office Windows",
        platform: "windows",
        method: "browser.focus",
        requiresApproval: true,
        permissionSetting: "allow_browser_control",
      }],
    },
    target: target(),
    automationPlan: "powershell private win32 focus",
  })
}

describe("Task 130 Yeonjang browser.focus Windows command skeleton", () => {
  it("builds a Windows backend command skeleton without executing focus or marking command accepted", () => {
    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toEqual({
      status: "skeleton_ready",
      reasonCode: "windows_browser_focus_command_skeleton_ready",
      method: "browser.focus",
      platform: "windows",
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
        "powershellScriptText",
        "win32WindowHandle",
      ],
    })
  })

  it("blocks before command planning when browser control approval is missing", () => {
    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(false),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "side_effect_authorization_required",
      executeOsFocusNow: false,
      commandAccepted: false,
    })
  })

  it("keeps Windows command backend and focused target observation backend failures distinct", () => {
    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ commandBackendAvailable: false }),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "command_backend_required",
    })

    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ observationBackendAvailable: false }),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "focused_target_observation_backend_required",
    })
  })

  it("blocks headless and unknown platform states with public reason codes", () => {
    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ desktopSession: "headless" }),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "headless_unavailable",
    })

    expect(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract({ platform: "unknown" }),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    })).toMatchObject({
      status: "skeleton_blocked",
      reasonCode: "platform_not_windows",
    })
  })

  it("does not expose raw Windows focus data and does not add Windows backend implementation yet", () => {
    const windowsSource = readFileSync("Yeonjang/src/platform/windows.rs", "utf8")
    const output = JSON.stringify(buildYeonjangBrowserFocusWindowsCommandSkeleton({
      target: target(),
      preflight: preflight(),
      commandContract: commandContract(),
      auditOnlyAutomationPlan: "powershell private win32 focus",
    }))

    expect(output).not.toMatch(
      /Private Trading Dashboard|https:\/\/example\.test|token=private|5024|hwnd-private|tab-private|powershell private|win32 focus/u,
    )
    expect(windowsSource).not.toContain("focus_browser")
    expect(windowsSource).not.toContain("browser_focus")
  })
})
