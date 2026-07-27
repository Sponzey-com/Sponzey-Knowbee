import { describe, expect, it } from "vitest"

import {
  projectYeonjangBrowserActiveTabInfoReadiness,
  selectReadyYeonjangBrowserActiveTabInfoTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"

describe("Task 194 Yeonjang browser.active_tab_info readiness projection", () => {
  it("projects runtime observations without internal instance IDs or raw active tab data", () => {
    const projection = projectYeonjangBrowserActiveTabInfoReadiness([
      {
        publicTargetName: "Office Mac",
        internalInstanceId: "internal-instance-private",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: true,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/account?token=private",
          windowId: "window-private",
          tabId: "tab-private",
        },
      },
    ])

    expect(projection).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-readiness-v1",
      method: "browser.active_tab_info",
      permissionSetting: "allow_browser_read",
      requiresApproval: true,
      readyCount: 1,
      blockedCount: 0,
      targets: [
        {
          publicTargetName: "Office Mac",
          platform: "macos",
          readinessStatus: "ready",
          missingRequirementCount: 0,
          missingRequirements: [],
          userAction: "ready_to_request_active_tab_approval",
        },
      ],
    })

    const publicJson = JSON.stringify(projection)
    expect(publicJson).not.toContain("internal-instance-private")
    expect(publicJson).not.toContain("Private Ticket")
    expect(publicJson).not.toContain("token=private")
    expect(publicJson).not.toContain("window-private")
    expect(publicJson).not.toContain("tab-private")
  })

  it("distinguishes permission, backend, headless, unsupported, and unknown readiness states", () => {
    const projection = projectYeonjangBrowserActiveTabInfoReadiness([
      {
        publicTargetName: "Permission Mac",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: false,
        observationBackendAvailable: true,
      },
      {
        publicTargetName: "Backend Windows",
        platform: "windows",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: false,
      },
      {
        publicTargetName: "Headless Linux",
        platform: "linux",
        desktopSession: "headless",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: true,
      },
      {
        publicTargetName: "Old Runtime",
        platform: "linux",
        desktopSession: "available",
        capabilityAdvertised: false,
        permissionGranted: true,
        observationBackendAvailable: true,
      },
      {
        publicTargetName: "Mystery",
        platform: "unknown",
        desktopSession: "unknown",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: true,
      },
    ])

    expect(projection.targets.map((target) => [target.publicTargetName, target.readinessStatus, target.userAction])).toEqual([
      ["Permission Mac", "permission_required", "enable_browser_read_permission"],
      ["Backend Windows", "observation_backend_required", "update_or_reinstall_yeonjang"],
      ["Headless Linux", "headless_unavailable", "start_interactive_desktop_session"],
      ["Old Runtime", "unsupported", "install_supported_yeonjang"],
      ["Mystery", "unknown", "select_supported_platform"],
    ])
    expect(projection.readyCount).toBe(0)
    expect(projection.blockedCount).toBe(5)
  })

  it("selects only ready public targets for later admission input", () => {
    const projection = projectYeonjangBrowserActiveTabInfoReadiness([
      {
        publicTargetName: "Ready Mac",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: true,
      },
      {
        publicTargetName: "No Permission",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: false,
        observationBackendAvailable: true,
      },
    ])

    expect(selectReadyYeonjangBrowserActiveTabInfoTargets(projection)).toEqual([
      {
        publicTargetName: "Ready Mac",
        platform: "macos",
        method: "browser.active_tab_info",
        requiresApproval: true,
        permissionSetting: "allow_browser_read",
      },
    ])
  })
})
