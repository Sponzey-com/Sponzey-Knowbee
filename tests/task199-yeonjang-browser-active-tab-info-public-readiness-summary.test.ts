import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoPublicReadinessSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-public-readiness-summary.ts"

describe("Task 199 Yeonjang browser.active_tab_info public readiness summary", () => {
  it("renders general UI readiness labels without exposing raw diagnostics or backend families", () => {
    const summary = buildYeonjangBrowserActiveTabInfoPublicReadinessSummary({
      observations: [{
        publicTargetName: "Office Mac",
        internalInstanceId: "internal-instance-private",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: false,
        diagnostic: {
          reasonCode: "active_tab_observation_backend_missing",
          candidateBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
        },
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/private?token=secret",
          profilePath: "/Users/example/Profile 1",
          windowId: "window-private",
          tabId: "tab-private",
        },
      }],
    })

    expect(summary).toEqual({
      schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
      method: "browser.active_tab_info",
      audience: "general",
      readyCount: 0,
      blockedCount: 1,
      targets: [{
        publicTargetName: "Office Mac",
        platform: "macos",
        readinessStatus: "observation_backend_required",
        statusLabel: "Observation backend required",
        userAction: "update_or_reinstall_yeonjang",
        actionLabel: "Update or reinstall Yeonjang",
        reasonLabel: "Active tab observation backend is not installed or enabled.",
      }],
    })

    const publicJson = JSON.stringify(summary)
    expect(publicJson).not.toContain("diagnostic")
    expect(publicJson).not.toContain("accessibility_api")
    expect(publicJson).not.toContain("browser_extension_bridge")
    expect(publicJson).not.toContain("internal-instance-private")
    expect(publicJson).not.toContain("Private Ticket")
    expect(publicJson).not.toContain("token=secret")
    expect(publicJson).not.toContain("Profile 1")
    expect(publicJson).not.toContain("window-private")
    expect(publicJson).not.toContain("tab-private")
  })

  it("shows backend families only for advanced diagnostics", () => {
    const summary = buildYeonjangBrowserActiveTabInfoPublicReadinessSummary({
      audience: "advanced",
      observations: [{
        publicTargetName: "Windows Desk",
        platform: "windows",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: false,
        diagnostic: {
          reasonCode: "active_tab_observation_backend_missing",
          candidateBackendFamilies: ["windows_ui_automation", "browser_extension_bridge"],
        },
      }],
    })

    expect(summary.targets[0]).toMatchObject({
      publicTargetName: "Windows Desk",
      readinessStatus: "observation_backend_required",
      advancedDiagnostic: {
        candidateBackendFamilies: ["windows_ui_automation", "browser_extension_bridge"],
      },
    })
    expect(JSON.stringify(summary)).not.toContain("reasonCode")
  })

  it("keeps permission and headless states user-actionable without raw source fields", () => {
    const summary = buildYeonjangBrowserActiveTabInfoPublicReadinessSummary({
      observations: [
        {
          publicTargetName: "Permission Off",
          platform: "linux",
          desktopSession: "available",
          capabilityAdvertised: true,
          permissionGranted: false,
          observationBackendAvailable: false,
          diagnostic: {
            reasonCode: "browser_read_permission_disabled",
            candidateBackendFamilies: ["linux_accessibility_api"],
          },
        },
        {
          publicTargetName: "Headless Box",
          platform: "linux",
          desktopSession: "headless",
          capabilityAdvertised: true,
          permissionGranted: true,
          observationBackendAvailable: false,
          diagnostic: {
            reasonCode: "interactive_desktop_required",
            candidateBackendFamilies: ["wayland_portal"],
          },
        },
      ],
    })

    expect(summary.targets.map((target) => ({
      status: target.readinessStatus,
      action: target.actionLabel,
      reason: target.reasonLabel,
    }))).toEqual([
      {
        status: "permission_required",
        action: "Enable browser read permission",
        reason: "Browser read permission is disabled.",
      },
      {
        status: "headless_unavailable",
        action: "Start an interactive desktop session",
        reason: "Interactive desktop access is required.",
      },
    ])
    expect(JSON.stringify(summary)).not.toMatch(/linux_accessibility_api|wayland_portal|diagnostic/u)
  })
})
