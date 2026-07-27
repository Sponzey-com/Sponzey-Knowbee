import { describe, expect, it } from "vitest"

import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.js"
import type { YeonjangBrowserActiveTabInfoRegistryRecord } from "../packages/core/src/release/yeonjang-browser-active-tab-info-readiness-source-adapter.js"

type RouteHandler = (...args: unknown[]) => unknown

const rawRecords: YeonjangBrowserActiveTabInfoRegistryRecord[] = [
  {
    publicTargetName: "Studio Mac",
    internalInstanceId: "internal-instance-private",
    sessionId: "session-private",
    clientId: "client-private",
    platform: "macos",
    desktopSession: "available",
    methods: ["browser.active_tab_info"],
    permissions: {
      allow_browser_read: true,
      privatePermissionScope: "scope-private",
    },
    toolHealth: {
      "browser.active_tab_info": {
        status: "ready",
        reasonCode: "active_tab_observation_backend_ready",
        candidateBackendFamilies: ["accessibility_api", "private_backend_family"],
        rawDetails: {
          activeTabTitle: "Private Banking",
          activeTabUrl: "https://example.test/account?token=secret",
          profilePath: "/Users/example/Profile 1",
          windowId: "window-private",
          tabId: "tab-private",
        },
        rawDetailsSchema: {
          visibility: "audit_only",
          required: ["browserName"],
          optional: ["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"],
        },
      },
    },
    rawMqttPayload: {
      topic: "private/topic",
      bearerToken: "mqtt-secret",
    },
  },
]

function registerRoutes(records = rawRecords) {
  const handlers = new Map<string, RouteHandler>()
  const preHandlers = new Map<string, unknown>()
  registerYeonjangInstancesRoute(
    {
      get(path: string, options: { preHandler?: unknown }, handler: RouteHandler) {
        handlers.set(path, handler)
        preHandlers.set(path, options.preHandler)
      },
      post() {},
    } as never,
    {
      browserActiveTabInfoReadinessRecords: () => records,
      fleetProjection: () => ({
        instances: [],
        summary: { duplicateLocalDetected: false },
        diffSummaries: [],
        promptProjection: {},
      }) as never,
      now: () => 1_000,
    },
  )
  return { handlers, preHandlers }
}

describe("Task 200 Yeonjang browser.active_tab_info readiness route boundary", () => {
  it("returns only general public readiness summary from the general route", async () => {
    const { handlers, preHandlers } = registerRoutes()
    const response = await handlers.get("/api/yeonjang/browser-active-tab-info/readiness")?.({}, {})

    expect(preHandlers.get("/api/yeonjang/browser-active-tab-info/readiness")).toBeTypeOf("function")
    expect(response).toEqual({
      schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
      method: "browser.active_tab_info",
      audience: "general",
      readyCount: 1,
      blockedCount: 0,
      targets: [{
        publicTargetName: "Studio Mac",
        platform: "macos",
        readinessStatus: "ready",
        statusLabel: "Ready",
        userAction: "ready_to_request_active_tab_approval",
        actionLabel: "Request active tab approval",
        reasonLabel: "Active tab observation backend is ready.",
      }],
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("advancedDiagnostic")
    expect(serialized).not.toContain("diagnostic")
    expect(serialized).not.toContain("reasonCode")
    expect(serialized).not.toContain("accessibility_api")
    expect(serialized).not.toContain("private_backend_family")
    expect(serialized).not.toContain("internal-instance-private")
    expect(serialized).not.toContain("session-private")
    expect(serialized).not.toContain("client-private")
    expect(serialized).not.toContain("scope-private")
    expect(serialized).not.toContain("Private Banking")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("private/topic")
    expect(serialized).not.toContain("mqtt-secret")
    expect(serialized).not.toContain("rawMqttPayload")
    expect(serialized).not.toContain("rawDetails")
    expect(serialized).not.toContain("rawDetailsSchema")
    expect(serialized).not.toContain("audit_only")
    expect(serialized).not.toContain("browserName")
    expect(serialized).not.toContain("toolHealth")
  })

  it("returns allowlisted backend families only from the advanced diagnostic route", async () => {
    const { handlers, preHandlers } = registerRoutes()
    const response = await handlers.get(
      "/api/yeonjang/browser-active-tab-info/readiness/diagnostics",
    )?.({}, {})

    expect(preHandlers.get(
      "/api/yeonjang/browser-active-tab-info/readiness/diagnostics",
    )).toBeTypeOf("function")
    expect(response).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
      method: "browser.active_tab_info",
      audience: "advanced",
      readyCount: 1,
      blockedCount: 0,
      targets: [{
        publicTargetName: "Studio Mac",
        platform: "macos",
        readinessStatus: "ready",
        advancedDiagnostic: {
          candidateBackendFamilies: ["accessibility_api"],
        },
      }],
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("diagnostic")
    expect(serialized).not.toContain("reasonCode")
    expect(serialized).not.toContain("private_backend_family")
    expect(serialized).not.toContain("internal-instance-private")
    expect(serialized).not.toContain("Private Banking")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("rawMqttPayload")
    expect(serialized).not.toContain("rawDetails")
    expect(serialized).not.toContain("rawDetailsSchema")
    expect(serialized).not.toContain("audit_only")
    expect(serialized).not.toContain("browserName")
    expect(serialized).not.toContain("toolHealth")
  })
})
