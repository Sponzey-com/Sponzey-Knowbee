import { describe, expect, it } from "vitest"

import {
  assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry,
  selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-readiness-source-adapter.ts"
import { projectYeonjangBrowserActiveTabInfoReadiness } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"

describe("Task 195 Yeonjang browser.active_tab_info readiness source adapter", () => {
  it("converts raw registry/tool health records into public readiness observations", () => {
    const observations = assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry({
      records: [
        {
          publicTargetName: "  Office   Mac  ",
          internalInstanceId: "internal-instance-private",
          sessionId: "session-private",
          clientId: "client-private",
          platform: "macos",
          desktopSession: "available",
          methods: ["browser.active_tab_info", "browser.list"],
          permissions: { allow_browser_read: true },
          toolHealth: {
            "browser.active_tab_info": {
              status: "ready",
              reasonCode: "active_tab_observation_backend_ready",
              candidateBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
              rawDetails: {
                title: "Private Ticket",
                url: "https://example.test/account?token=private",
                profilePath: "/Users/example/Profile 1",
              },
            },
          },
          rawMqttPayload: {
            windowId: "window-private",
            tabId: "tab-private",
          },
        },
      ],
    })

    expect(observations).toEqual([
      {
        publicTargetName: "Office Mac",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: true,
        diagnostic: {
          reasonCode: "active_tab_observation_backend_ready",
          candidateBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
        },
      },
    ])

    const publicJson = JSON.stringify(observations)
    expect(publicJson).not.toContain("internal-instance-private")
    expect(publicJson).not.toContain("session-private")
    expect(publicJson).not.toContain("client-private")
    expect(publicJson).not.toContain("Private Ticket")
    expect(publicJson).not.toContain("token=private")
    expect(publicJson).not.toContain("Profile 1")
    expect(publicJson).not.toContain("window-private")
    expect(publicJson).not.toContain("tab-private")
  })

  it("feeds readiness projection without exposing raw source details", () => {
    const observations = assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry({
      records: [
        {
          publicTargetName: "No Permission",
          platform: "windows",
          desktopSession: "available",
          methods: ["browser.active_tab_info"],
          permissions: { allow_browser_read: false },
          toolHealth: { "browser.active_tab_info": { status: "ready" } },
          internalInstanceId: "private-windows",
        },
      ],
    })

    const projection = projectYeonjangBrowserActiveTabInfoReadiness(observations)
    expect(projection.targets[0]).toMatchObject({
      publicTargetName: "No Permission",
      platform: "windows",
      readinessStatus: "permission_required",
      userAction: "enable_browser_read_permission",
    })
    expect(JSON.stringify(projection)).not.toContain("private-windows")
  })

  it("maps unsupported tool health and missing method to blocked readiness inputs", () => {
    const observations = assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry({
      records: [
        {
          publicTargetName: "Old Runtime",
          platform: "linux",
          desktopSession: "available",
          methods: ["browser.list"],
          permissions: { allow_browser_read: true },
          toolHealth: {},
        },
        {
          publicTargetName: "Backend Missing",
          platform: "macos",
          desktopSession: "available",
          methods: ["browser.active_tab_info"],
          permissions: { allow_browser_read: true },
          toolHealth: {
            "browser.active_tab_info": {
              status: "unsupported",
              reasonCode: "active_tab_observation_backend_missing",
              candidateBackendFamilies: [
                "accessibility_api",
                "browser_extension_bridge",
                "private_backend",
              ],
              rawDetails: {
                title: "Leaked Title",
                url: "https://example.test/private?token=secret",
                internalInstanceId: "private-health-id",
              },
            },
          },
        },
      ],
    })

    expect(observations).toEqual([
      {
        publicTargetName: "Old Runtime",
        platform: "linux",
        desktopSession: "available",
        capabilityAdvertised: false,
        permissionGranted: true,
        observationBackendAvailable: false,
      },
      {
        publicTargetName: "Backend Missing",
        platform: "macos",
        desktopSession: "available",
        capabilityAdvertised: true,
        permissionGranted: true,
        observationBackendAvailable: false,
        diagnostic: {
          reasonCode: "active_tab_observation_backend_missing",
          candidateBackendFamilies: ["accessibility_api", "browser_extension_bridge"],
        },
      },
    ])

    expect(JSON.stringify(observations)).not.toContain("private_backend")
    expect(JSON.stringify(observations)).not.toContain("Leaked Title")
    expect(JSON.stringify(observations)).not.toContain("token=secret")
    expect(JSON.stringify(observations)).not.toContain("private-health-id")

    const projection = projectYeonjangBrowserActiveTabInfoReadiness(observations)
    expect(projection.targets).toEqual([
      {
        publicTargetName: "Old Runtime",
        platform: "linux",
        readinessStatus: "unsupported",
        missingRequirementCount: 2,
        missingRequirements: [
          "browser_active_tab_info_capability",
          "active_tab_observation_backend",
        ],
        userAction: "install_supported_yeonjang",
      },
      {
        publicTargetName: "Backend Missing",
        platform: "macos",
        readinessStatus: "observation_backend_required",
        missingRequirementCount: 1,
        missingRequirements: ["active_tab_observation_backend"],
        userAction: "update_or_reinstall_yeonjang",
      },
    ])
  })

  it("selects a redacted active tab observation from audit-only registry tool health details", () => {
    const result = selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry({
      publicTargetName: "Office Mac",
      records: [
        {
          publicTargetName: "  Office   Mac  ",
          internalInstanceId: "internal-instance-private",
          sessionId: "session-private",
          clientId: "client-private",
          platform: "macos",
          desktopSession: "available",
          methods: ["browser.active_tab_info"],
          permissions: { allow_browser_read: true },
          toolHealth: {
            "browser.active_tab_info": {
              status: "ready",
              candidateBackendFamilies: ["accessibility_api"],
              rawDetails: {
                browserName: "Google Chrome",
                title: "Private Ticket",
                url: "https://example.test/account?token=private",
                profilePath: "/Users/example/Profile 1",
                pid: 1234,
                windowId: "window-private",
                tabId: "tab-private",
                backendFamily: "accessibility_api",
              },
            },
          },
          rawMqttPayload: {
            bearerToken: "mqtt-secret",
          },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.reasonCode)
    expect(result.observation).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-v1",
      method: "browser.active_tab_info",
      observationStatus: "available",
      browserName: "Google Chrome",
      titleLength: "Private Ticket".length,
      urlScheme: "https",
    })

    const serialized = JSON.stringify(result.observation)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("1234")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("internal-instance-private")
    expect(serialized).not.toContain("session-private")
    expect(serialized).not.toContain("client-private")
    expect(serialized).not.toContain("accessibility_api")
    expect(serialized).not.toContain("mqtt-secret")
  })

  it("fails closed when redacted observation source is missing, ambiguous, or invalid", () => {
    const validRecord = {
      publicTargetName: "Office Mac",
      platform: "macos" as const,
      desktopSession: "available" as const,
      methods: ["browser.active_tab_info"],
      permissions: { allow_browser_read: true },
      toolHealth: {
        "browser.active_tab_info": {
          status: "ready" as const,
          rawDetails: {
            browserName: "Google Chrome",
            title: "Private Ticket",
          },
        },
      },
    }

    expect(selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry({
      publicTargetName: "Missing Mac",
      records: [validRecord],
    })).toEqual({ ok: false, reasonCode: "active_tab_info_redacted_source_missing" })

    expect(selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry({
      publicTargetName: "Office Mac",
      records: [validRecord, { ...validRecord }],
    })).toEqual({ ok: false, reasonCode: "active_tab_info_redacted_source_ambiguous" })

    expect(selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry({
      publicTargetName: "Office Mac",
      records: [{
        ...validRecord,
        toolHealth: {
          "browser.active_tab_info": {
            status: "ready",
            rawDetails: {
              title: "Private Ticket",
            },
          },
        },
      }],
    })).toEqual({ ok: false, reasonCode: "browser_name_required" })
  })
})
