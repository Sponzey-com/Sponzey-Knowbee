import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoPublicReadinessSummary,
} from "../packages/webui/src/contracts/yeonjang.js"
import {
  buildYeonjangBrowserActiveTabInfoAdvancedReadinessView,
  buildYeonjangBrowserActiveTabInfoGeneralReadinessView,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-readiness-view.js"

const text = (ko: string, _en: string) => ko

const generalSummary: YeonjangBrowserActiveTabInfoPublicReadinessSummary = {
  schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
  method: "browser.active_tab_info",
  audience: "general",
  readyCount: 1,
  blockedCount: 2,
  targets: [
    {
      publicTargetName: "Studio Mac",
      platform: "macos",
      readinessStatus: "ready",
      statusLabel: "Ready",
      userAction: "ready_to_request_active_tab_approval",
      actionLabel: "Request active tab approval",
      reasonLabel: "Active tab observation is ready.",
    },
    {
      publicTargetName: "Office Windows",
      platform: "windows",
      readinessStatus: "permission_required",
      statusLabel: "Permission required",
      userAction: "enable_browser_read_permission",
      actionLabel: "Enable browser read permission",
      reasonLabel: "Browser read permission is disabled.",
    },
    {
      publicTargetName: "Headless Linux",
      platform: "linux",
      readinessStatus: "headless_unavailable",
      statusLabel: "Interactive desktop required",
      userAction: "start_interactive_desktop_session",
      actionLabel: "Start an interactive desktop session",
      reasonLabel: "Interactive desktop access is unavailable.",
    },
  ],
}

const advancedSummary: YeonjangBrowserActiveTabInfoPublicReadinessSummary = {
  ...generalSummary,
  audience: "advanced",
  targets: [
    {
      ...generalSummary.targets[0],
      advancedDiagnostic: {
        candidateBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
      },
    },
  ],
}

describe("Task 202 WebUI active tab info readiness view-model", () => {
  it("builds a general user view with grouped targets and action priority", () => {
    const view = buildYeonjangBrowserActiveTabInfoGeneralReadinessView(generalSummary, text)

    expect(view).toMatchObject({
      method: "browser.active_tab_info",
      audience: "general",
      overallStatus: "action_required",
      targetCount: 3,
      readyCount: 1,
      blockedCount: 2,
      primaryAction: {
        userAction: "enable_browser_read_permission",
        label: "Enable browser read permission",
        targetName: "Office Windows",
      },
      groups: {
        ready: { count: 1 },
        blocked: { count: 2 },
      },
    })
    expect(view.groups.ready.targets.map((target) => target.targetName)).toEqual(["Studio Mac"])
    expect(view.groups.blocked.targets.map((target) => target.targetName)).toEqual([
      "Office Windows",
      "Headless Linux",
    ])
  })

  it("does not expose advanced diagnostics or raw source fields in the general view", () => {
    const raw = {
      ...generalSummary,
      targets: [{
        ...generalSummary.targets[1],
        advancedDiagnostic: {
          candidateBackendFamilies: ["windows_ui_automation"],
        },
        diagnostic: { reasonCode: "browser_read_permission_disabled" },
        internalInstanceId: "internal-instance-private",
        rawActiveTab: {
          title: "Private Banking",
          url: "https://example.test/private?token=secret",
          profilePath: "/Users/example/Profile 1",
          windowId: "window-private",
          tabId: "tab-private",
        },
        toolHealth: { "browser.active_tab_info": { status: "permission_disabled" } },
      }],
    } as unknown as YeonjangBrowserActiveTabInfoPublicReadinessSummary

    const view = buildYeonjangBrowserActiveTabInfoGeneralReadinessView(raw, text)
    const serialized = JSON.stringify(view)

    expect(serialized).not.toContain("advancedDiagnostic")
    expect(serialized).not.toContain("windows_ui_automation")
    expect(serialized).not.toContain("diagnostic")
    expect(serialized).not.toContain("reasonCode")
    expect(serialized).not.toContain("internal-instance-private")
    expect(serialized).not.toContain("Private Banking")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("toolHealth")
  })

  it("requires a general summary for the default user view", () => {
    expect(() =>
      buildYeonjangBrowserActiveTabInfoGeneralReadinessView(advancedSummary, text),
    ).toThrow(/general/u)
  })

  it("builds an explicit advanced diagnostics view without raw target internals", () => {
    const view = buildYeonjangBrowserActiveTabInfoAdvancedReadinessView(advancedSummary, text)

    expect(view).toEqual({
      method: "browser.active_tab_info",
      audience: "advanced",
      title: "활성 탭 진단",
      summary: "고급 진단에서만 관찰 backend 후보를 확인합니다.",
      targets: [{
        targetName: "Studio Mac",
        platformLabel: "macOS",
        statusLabel: "Ready",
        backendFamilyLabels: ["Accessibility API", "Browser extension bridge"],
      }],
    })
    expect(JSON.stringify(view)).not.toMatch(
      /diagnostic|reasonCode|internalInstanceId|rawActiveTab|token=secret|window-private|tab-private/u,
    )
  })
})
