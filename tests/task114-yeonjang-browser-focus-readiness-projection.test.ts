import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusReadinessProjection,
  YEONJANG_BROWSER_FOCUS_CONTRACT,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"

describe("Task 114 Yeonjang browser.focus readiness projection", () => {
  it("projects OS backend feasibility without exposing raw target or instance data", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Office Mac",
          internalInstanceId: "instance-private-mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
          rawFocusedTarget: {
            targetAlias: "업무 브라우저",
            processName: "Google Chrome",
            title: "Private CRM",
            url: "https://example.test/customer?token=secret",
            pid: 9012,
            windowId: "window-secret",
            tabId: "tab-secret",
          },
        },
        {
          publicTargetName: "Studio Windows",
          internalInstanceId: "instance-private-win",
          platform: "windows",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: false,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Linux Desktop",
          internalInstanceId: "instance-private-linux-desktop",
          platform: "linux",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: false,
        },
        {
          publicTargetName: "Linux Headless",
          internalInstanceId: "instance-private-linux-headless",
          platform: "linux",
          desktopSession: "headless",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Unknown Worker",
          internalInstanceId: "instance-private-unknown",
          platform: "unknown",
          desktopSession: "unknown",
          capabilitySupported: false,
          permissionGranted: false,
          commandBackendAvailable: false,
          observationBackendAvailable: false,
        },
      ],
    })

    expect(projection).toMatchObject({
      schemaVersion: "yeonjang-browser-focus-readiness-v1",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      readyCount: 1,
      blockedCount: 4,
    })
    expect(projection.targets).toEqual([
      expect.objectContaining({
        publicTargetName: "Office Mac",
        platform: "macos",
        readinessStatus: "ready",
        missingRequirementCount: 0,
        userAction: "ready_to_request_focus_approval",
      }),
      expect.objectContaining({
        publicTargetName: "Studio Windows",
        platform: "windows",
        readinessStatus: "permission_required",
        missingRequirementCount: 1,
        missingRequirements: ["browser_control_permission"],
        userAction: "enable_browser_control_permission",
      }),
      expect.objectContaining({
        publicTargetName: "Linux Desktop",
        platform: "linux",
        readinessStatus: "observation_backend_required",
        missingRequirementCount: 1,
        missingRequirements: ["focused_target_observation_backend"],
      }),
      expect.objectContaining({
        publicTargetName: "Linux Headless",
        platform: "linux",
        readinessStatus: "headless_unavailable",
        missingRequirementCount: 1,
        missingRequirements: ["interactive_desktop_session"],
      }),
      expect.objectContaining({
        publicTargetName: "Unknown Worker",
        platform: "unknown",
        readinessStatus: "unsupported",
        missingRequirementCount: 4,
      }),
    ])

    const serialized = JSON.stringify(projection)
    expect(serialized).not.toContain("instance-private")
    expect(serialized).not.toContain("Private CRM")
    expect(serialized).not.toContain("https://example.test")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("9012")
    expect(serialized).not.toContain("window-secret")
    expect(serialized).not.toContain("tab-secret")
  })

  it("fails closed when target name is missing or capability command backend is unavailable", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "   ",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Office Mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: false,
          observationBackendAvailable: true,
        },
      ],
    })

    expect(projection.targets).toEqual([
      expect.objectContaining({
        publicTargetName: "Yeonjang target",
        readinessStatus: "target_identity_required",
        missingRequirements: ["public_target_name"],
        userAction: "select_exact_yeonjang_target",
      }),
      expect.objectContaining({
        publicTargetName: "Office Mac",
        readinessStatus: "command_backend_required",
        missingRequirements: ["browser_focus_command_backend"],
        userAction: "update_or_reinstall_yeonjang",
      }),
    ])
    expect(projection.readyCount).toBe(0)
    expect(projection.blockedCount).toBe(2)
  })
})
