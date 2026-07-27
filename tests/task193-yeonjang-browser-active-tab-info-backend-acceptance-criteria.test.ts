import { describe, expect, it } from "vitest"

import { buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria } from "../packages/core/src/release/yeonjang-browser-active-tab-info-backend-acceptance-criteria.ts"

describe("Task 193 Yeonjang browser.active_tab_info backend acceptance criteria", () => {
  it("defines platform-specific criteria without opening Rust dispatch or production binding", () => {
    const criteria = buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({})

    expect(criteria).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-backend-acceptance-criteria-v1",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      addProductionBindingNow: false,
      addRustDispatchNow: false,
      requiresApproval: true,
      requiresRedactedProjection: true,
      defaultLiveSmokeAllowed: false,
      postCheckMode: "observation_schema_required",
    })
    expect(criteria.platforms.map((platform) => `${platform.platform}:${platform.desktopProfile}`)).toEqual([
      "macos:interactive_desktop",
      "windows:interactive_desktop",
      "linux:interactive_desktop",
      "linux:headless",
      "unknown:headless",
    ])
  })

  it("separates OS permission and backend families while keeping raw fields audit-only", () => {
    const criteria = buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({})
    const macos = criteria.platforms.find((platform) => platform.platform === "macos")
    const windows = criteria.platforms.find((platform) => platform.platform === "windows")
    const linux = criteria.platforms.find(
      (platform) => platform.platform === "linux" && platform.desktopProfile === "interactive_desktop",
    )

    expect(macos).toMatchObject({
      acceptedBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
      requiredPermissions: ["allow_browser_read", "macos_accessibility", "browser_extension_permission"],
      failureReasonCodes: expect.arrayContaining(["permission_required", "observation_backend_required"]),
    })
    expect(windows).toMatchObject({
      acceptedBackendFamilies: ["windows_ui_automation", "browser_extension_bridge"],
      requiredPermissions: ["allow_browser_read", "windows_ui_automation", "browser_extension_permission"],
      failureReasonCodes: expect.arrayContaining(["permission_required", "observation_backend_required"]),
    })
    expect(linux).toMatchObject({
      acceptedBackendFamilies: ["linux_accessibility_api", "browser_extension_bridge", "wayland_portal"],
      requiredPermissions: ["allow_browser_read", "linux_desktop_automation", "browser_extension_permission"],
      failureReasonCodes: expect.arrayContaining(["permission_required", "observation_backend_required"]),
    })

    for (const platform of criteria.platforms) {
      expect(platform.auditOnlyFields).toEqual(
        expect.arrayContaining(["rawTitle", "rawUrl", "queryToken", "profilePath", "pid", "windowId", "tabId"]),
      )
      expect(platform.publicFields).not.toEqual(
        expect.arrayContaining(["rawTitle", "rawUrl", "queryToken", "profilePath", "pid", "windowId", "tabId"]),
      )
    }
  })

  it("keeps headless and unknown platforms unavailable instead of claiming default support", () => {
    const criteria = buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({})
    const linuxHeadless = criteria.platforms.find(
      (platform) => platform.platform === "linux" && platform.desktopProfile === "headless",
    )
    const unknown = criteria.platforms.find((platform) => platform.platform === "unknown")

    expect(linuxHeadless).toMatchObject({
      acceptedBackendFamilies: [],
      successCriteria: [],
      failureReasonCodes: ["headless_unavailable"],
    })
    expect(unknown).toMatchObject({
      acceptedBackendFamilies: [],
      successCriteria: [],
      failureReasonCodes: ["platform_unknown"],
    })
    expect(criteria.prohibitedPatterns).toEqual(
      expect.arrayContaining([
        "system_exec_active_tab_bypass",
        "browser_profile_file_scrape",
        "raw_active_tab_public_output",
        "observation_success_as_goal_success",
      ]),
    )
  })
})
