import { beforeEach, describe, expect, it, vi } from "vitest"

import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import {
  parseYeonjangBrowserActiveTabInfoPublicReadinessSummary,
} from "../packages/webui/src/contracts/yeonjang.js"

const generalResponse = {
  schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
  method: "browser.active_tab_info",
  audience: "general",
  readyCount: 0,
  blockedCount: 1,
  targets: [{
    publicTargetName: "Studio Mac",
    platform: "macos",
    readinessStatus: "observation_backend_required",
    statusLabel: "Observation backend required",
    userAction: "update_or_reinstall_yeonjang",
    actionLabel: "Update or reinstall Yeonjang",
    reasonLabel: "Active tab observation backend is required.",
    advancedDiagnostic: {
      candidateBackendFamilies: ["accessibility_api", "private_backend_family"],
    },
    diagnostic: {
      reasonCode: "active_tab_observation_backend_missing",
    },
    internalInstanceId: "internal-instance-private",
    rawActiveTab: {
      title: "Private Banking",
      url: "https://example.test/private?token=secret",
      profilePath: "/Users/example/Profile 1",
      windowId: "window-private",
      tabId: "tab-private",
    },
    rawDetailsSchema: {
      visibility: "audit_only",
      required: ["browserName"],
      optional: ["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"],
    },
    toolHealth: {
      "browser.active_tab_info": { status: "unsupported" },
    },
  }],
  rawMqttPayload: {
    topic: "private/topic",
    token: "mqtt-secret",
  },
}

const advancedResponse = {
  ...generalResponse,
  audience: "advanced",
  targets: [{
    ...generalResponse.targets[0],
    advancedDiagnostic: {
      candidateBackendFamilies: ["accessibility_api", "private_backend_family"],
    },
  }],
}

describe("Task 201 WebUI active tab info readiness client boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("parses only the public general readiness schema and drops raw source fields", () => {
    const parsed = parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(generalResponse, "general")

    expect(parsed).toEqual({
      schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
      method: "browser.active_tab_info",
      audience: "general",
      readyCount: 0,
      blockedCount: 1,
      targets: [{
        publicTargetName: "Studio Mac",
        platform: "macos",
        readinessStatus: "observation_backend_required",
        statusLabel: "Observation backend required",
        userAction: "update_or_reinstall_yeonjang",
        actionLabel: "Update or reinstall Yeonjang",
        reasonLabel: "Active tab observation backend is required.",
      }],
    })

    const serialized = JSON.stringify(parsed)
    expect(serialized).not.toContain("advancedDiagnostic")
    expect(serialized).not.toContain("diagnostic")
    expect(serialized).not.toContain("reasonCode")
    expect(serialized).not.toContain("private_backend_family")
    expect(serialized).not.toContain("internal-instance-private")
    expect(serialized).not.toContain("Private Banking")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("rawMqttPayload")
    expect(serialized).not.toContain("rawDetailsSchema")
    expect(serialized).not.toContain("audit_only")
    expect(serialized).not.toContain("browserName")
    expect(serialized).not.toContain("toolHealth")
  })

  it("keeps advanced diagnostic access explicit and allowlisted", () => {
    const parsed = parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(
      advancedResponse,
      "advanced",
    )

    expect(parsed.targets[0]).toMatchObject({
      publicTargetName: "Studio Mac",
      advancedDiagnostic: {
        candidateBackendFamilies: ["accessibility_api"],
      },
    })
    expect(JSON.stringify(parsed)).not.toMatch(
      /private_backend_family|diagnostic|reasonCode|internal-instance-private|Private Banking|token=secret|rawMqttPayload|toolHealth/u,
    )
    expect(JSON.stringify(parsed)).not.toMatch(/rawDetailsSchema|audit_only|browserName/u)
  })

  it("calls the general endpoint by default and does not preserve raw response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => generalResponse,
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    const result = await localAdapter.getYeonjangBrowserActiveTabInfoReadiness(controller.signal)

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/yeonjang/browser-active-tab-info/readiness")
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
    expect(result.audience).toBe("general")
    expect(JSON.stringify(result)).not.toMatch(/advancedDiagnostic|rawActiveTab|rawDetailsSchema|audit_only|browserName|toolHealth|rawMqttPayload|token=secret/u)
  })

  it("calls the diagnostics endpoint only through the explicit advanced client function", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => advancedResponse,
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await localAdapter.getYeonjangBrowserActiveTabInfoDiagnostics()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/yeonjang/browser-active-tab-info/readiness/diagnostics",
    )
    expect(result.audience).toBe("advanced")
    expect(result.targets[0]?.advancedDiagnostic?.candidateBackendFamilies).toEqual([
      "accessibility_api",
    ])
  })

  it("rejects an audience mismatch instead of silently treating diagnostics as general data", () => {
    expect(() =>
      parseYeonjangBrowserActiveTabInfoPublicReadinessSummary(advancedResponse, "general"),
    ).toThrow(/audience/u)
  })
})
