import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusBackendAcceptanceCriteria,
} from "../packages/core/src/release/yeonjang-browser-focus-backend-acceptance-criteria.ts"

describe("Task 135 Yeonjang browser.focus OS backend acceptance criteria", () => {
  it("documents platform-specific backend families, permissions, post-checks, and failure reasons", () => {
    expect(buildYeonjangBrowserFocusBackendAcceptanceCriteria({
      auditOnlyDetails: {
        macosScript: "osascript private focus",
        windowsScript: "powershell private win32 focus",
        linuxScript: "xdotool private focus",
        rawWindowTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
        internalInstanceId: "private-instance",
      },
    })).toEqual({
      schemaVersion: "yeonjang-browser-focus-backend-acceptance-criteria-v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      addProductionBindingNow: false,
      addRustDispatchNow: false,
      requiresApproval: true,
      requiresFocusedTargetObservation: true,
      postCheckMode: "focused_target_observation_required",
      prohibitedPatterns: [
        "system_exec_focus_bypass",
        "command_success_as_goal_success",
        "raw_automation_script_public_output",
        "raw_target_public_output",
      ],
      platforms: [
        {
          platform: "macos",
          desktopProfile: "interactive_desktop",
          acceptedBackendFamilies: ["accessibility_api", "osascript"],
          requiredPermissions: ["allow_browser_control", "macos_accessibility"],
          preconditions: [
            "approval_receipt_required",
            "browser_focus_capability_advertised",
            "browser_focus_command_backend_ready",
            "focused_target_observation_backend_ready",
            "interactive_desktop_session_required",
          ],
          successCriteria: [
            "command_accepted",
            "focused_target_observation_available",
            "focused_target_matches_expected_projection",
          ],
          failureReasonCodes: [
            "side_effect_authorization_required",
            "command_backend_required",
            "focused_target_observation_backend_required",
            "focused_target_mismatch",
            "target_observation_required",
            "platform_not_macos",
          ],
          auditOnlyFields: [
            "rawWindowTitle",
            "rawUrl",
            "queryToken",
            "pid",
            "windowId",
            "tabId",
            "automationScriptText",
          ],
        },
        {
          platform: "windows",
          desktopProfile: "interactive_desktop",
          acceptedBackendFamilies: ["win32_api", "powershell"],
          requiredPermissions: ["allow_browser_control", "windows_ui_automation"],
          preconditions: [
            "approval_receipt_required",
            "browser_focus_capability_advertised",
            "browser_focus_command_backend_ready",
            "focused_target_observation_backend_ready",
            "interactive_desktop_session_required",
          ],
          successCriteria: [
            "command_accepted",
            "focused_target_observation_available",
            "focused_target_matches_expected_projection",
          ],
          failureReasonCodes: [
            "side_effect_authorization_required",
            "command_backend_required",
            "focused_target_observation_backend_required",
            "headless_unavailable",
            "focused_target_mismatch",
            "target_observation_required",
            "platform_not_windows",
          ],
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
        },
        {
          platform: "linux",
          desktopProfile: "interactive_desktop",
          acceptedBackendFamilies: ["xdotool", "wmctrl", "wayland_portal"],
          requiredPermissions: ["allow_browser_control", "linux_desktop_automation"],
          preconditions: [
            "approval_receipt_required",
            "browser_focus_capability_advertised",
            "browser_focus_command_backend_ready",
            "focused_target_observation_backend_ready",
            "interactive_desktop_session_required",
          ],
          successCriteria: [
            "command_accepted",
            "focused_target_observation_available",
            "focused_target_matches_expected_projection",
          ],
          failureReasonCodes: [
            "side_effect_authorization_required",
            "command_backend_required",
            "focused_target_observation_backend_required",
            "headless_unavailable",
            "focused_target_mismatch",
            "target_observation_required",
            "platform_not_linux",
          ],
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
        },
        {
          platform: "linux",
          desktopProfile: "headless",
          acceptedBackendFamilies: [],
          requiredPermissions: ["allow_browser_control"],
          preconditions: ["interactive_desktop_session_required"],
          successCriteria: [],
          failureReasonCodes: ["headless_unavailable"],
          auditOnlyFields: [],
        },
      ],
    })
  })

  it("does not expose raw target, automation, or internal instance details in public criteria output", () => {
    const output = JSON.stringify(buildYeonjangBrowserFocusBackendAcceptanceCriteria({
      auditOnlyDetails: {
        macosScript: "osascript private focus",
        windowsScript: "powershell private win32 focus",
        linuxScript: "xdotool private focus",
        rawWindowTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
        internalInstanceId: "private-instance",
      },
    }))

    expect(output).not.toMatch(
      /osascript private|powershell private|xdotool private|Private Admin Console|https:\/\/example\.test|token=private|private-instance/u,
    )
  })

  it("keeps implementation closed until a later Rust dispatch task", () => {
    const criteria = buildYeonjangBrowserFocusBackendAcceptanceCriteria({})

    expect(criteria.addProductionBindingNow).toBe(false)
    expect(criteria.addRustDispatchNow).toBe(false)
    for (const platform of criteria.platforms) {
      if (platform.desktopProfile === "interactive_desktop") {
        expect(platform.preconditions).toContain("approval_receipt_required")
        expect(platform.preconditions).toContain("focused_target_observation_backend_ready")
        expect(platform.successCriteria).toContain("focused_target_matches_expected_projection")
      }
    }
  })
})
