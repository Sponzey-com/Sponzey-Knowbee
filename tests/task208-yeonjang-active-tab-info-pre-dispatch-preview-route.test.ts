import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.js"
import { buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria } from "../packages/core/src/release/yeonjang-browser-active-tab-info-backend-acceptance-criteria.ts"
import { buildYeonjangBrowserActiveTabInfoRustInventoryContract } from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-inventory-contract.ts"
import type { YeonjangBrowserActiveTabInfoRegistryRecord } from "../packages/core/src/release/yeonjang-browser-active-tab-info-readiness-source-adapter.ts"

type RouteHandler = (...args: unknown[]) => unknown

const READY_TARGET = {
  publicTargetName: "Studio Mac",
  platform: "macos" as const,
  method: "browser.active_tab_info" as const,
  requiresApproval: true,
  permissionSetting: "allow_browser_read" as const,
}

const APPROVAL_RECEIPT = {
  method: "browser.active_tab_info" as const,
  publicTargetName: "Studio Mac",
  approvalScope: "allow_once" as const,
  approvedAt: "2026-07-22T05:00:00.000Z",
  nonce: "approval-nonce-123",
}

const REDACTED_PROJECTION = projectYeonjangBrowserActiveTabInfo({
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  profilePath: "/Users/example/Profile 1",
  windowId: "window-private",
  tabId: "tab-private",
  observationStatus: "available",
})

function registerRoutes(options: {
  redactedObservationForTarget?: (publicTargetName: string) => unknown
  records?: readonly YeonjangBrowserActiveTabInfoRegistryRecord[]
} = {}) {
  const handlers = new Map<string, RouteHandler>()
  const preHandlers = new Map<string, unknown>()
  registerYeonjangInstancesRoute(
    {
      get(path: string, options: { preHandler?: unknown }, handler: RouteHandler) {
        handlers.set(`GET ${path}`, handler)
        preHandlers.set(`GET ${path}`, options.preHandler)
      },
      post(path: string, options: { preHandler?: unknown }, handler: RouteHandler) {
        handlers.set(`POST ${path}`, handler)
        preHandlers.set(`POST ${path}`, options.preHandler)
      },
    } as never,
    {
      browserActiveTabInfoReadinessRecords: () => options.records ?? [],
      browserActiveTabInfoRedactedObservationForTarget: options.redactedObservationForTarget as never,
      fleetProjection: () => ({
        instances: [],
        summary: { duplicateLocalDetected: false },
        diffSummaries: [],
        promptProjection: {},
      }) as never,
      now: () => Date.parse("2026-07-22T05:00:01.000Z"),
    },
  )
  return { handlers, preHandlers }
}

describe("Task 208 Yeonjang active tab info pre-dispatch preview route", () => {
  it("returns a public-safe prepared preview from an authenticated route without dispatch flags", async () => {
    const { handlers, preHandlers } = registerRoutes()
    const route = "POST /api/yeonjang/browser-active-tab-info/pre-dispatch/preview"

    const response = await handlers.get(route)?.({
      body: {
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL_RECEIPT,
        criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
        rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
        redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/account?token=private",
        },
        internalInstanceId: "internal-private-instance",
        backendFamily: "accessibility_api",
      },
    }, {})

    expect(preHandlers.get(route)).toBeTypeOf("function")
    expect(response).toEqual({
      status: "prepared",
      reasonCode: "active_tab_info_pre_dispatch_prepared",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      publicTargetName: "Studio Mac",
      platform: "macos",
      observationStatus: "available",
      browserName: "Google Chrome",
      requiredGateCount: 5,
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("approval-nonce-123")
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("internal-private-instance")
    expect(serialized).not.toContain("accessibility_api")
    expect(serialized).not.toContain("rawActiveTab")
  })

  it("returns a public-safe blocked preview when approval is missing", async () => {
    const { handlers } = registerRoutes()
    const route = "POST /api/yeonjang/browser-active-tab-info/pre-dispatch/preview"

    const response = await handlers.get(route)?.({
      body: {
        readyTarget: READY_TARGET,
        criteria: buildYeonjangBrowserActiveTabInfoBackendAcceptanceCriteria({}),
        rustInventory: buildYeonjangBrowserActiveTabInfoRustInventoryContract({}),
        redactedProjection: REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined,
      },
    }, {})

    expect(response).toEqual({
      status: "blocked",
      reasonCode: "active_tab_info_approval_required",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(response)).not.toContain("nonce")
  })

  it("fills backend criteria and rust inventory inside Core instead of requiring WebUI to send them", async () => {
    const { handlers } = registerRoutes()
    const route = "POST /api/yeonjang/browser-active-tab-info/pre-dispatch/preview"

    const response = await handlers.get(route)?.({
      body: {
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL_RECEIPT,
      },
    }, {})

    expect(response).toEqual({
      status: "blocked",
      reasonCode: "active_tab_info_redacted_projection_required",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("approval-nonce-123")
    expect(serialized).not.toContain("acceptedBackendFamilies")
    expect(serialized).not.toContain("accessibility_api")
    expect(serialized).not.toContain("windows_ui_automation")
    expect(serialized).not.toContain("rustInventory")
  })

  it("uses a Core-owned redacted observation source without accepting raw browser data from WebUI", async () => {
    const { handlers } = registerRoutes({
      redactedObservationForTarget: (publicTargetName) => {
        expect(publicTargetName).toBe("Studio Mac")
        return REDACTED_PROJECTION.ok ? REDACTED_PROJECTION.observation : undefined
      },
    })
    const route = "POST /api/yeonjang/browser-active-tab-info/pre-dispatch/preview"

    const response = await handlers.get(route)?.({
      body: {
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL_RECEIPT,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/account?token=private",
        },
        internalInstanceId: "internal-private-instance",
      },
    }, {})

    expect(response).toEqual({
      status: "prepared",
      reasonCode: "active_tab_info_pre_dispatch_prepared",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      publicTargetName: "Studio Mac",
      platform: "macos",
      observationStatus: "available",
      browserName: "Google Chrome",
      requiredGateCount: 5,
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("approval-nonce-123")
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("internal-private-instance")
  })

  it("derives redacted observation from registry tool-health source when no provider override is supplied", async () => {
    const { handlers } = registerRoutes({
      records: [{
        publicTargetName: "Studio Mac",
        internalInstanceId: "internal-private-instance",
        platform: "macos",
        desktopSession: "available",
        methods: ["browser.active_tab_info"],
        permissions: { allow_browser_read: true },
        toolHealth: {
          "browser.active_tab_info": {
            status: "ready",
            rawDetails: {
              browserName: "Google Chrome",
              title: "Private Ticket",
              url: "https://example.test/account?token=private",
              profilePath: "/Users/example/Profile 1",
              windowId: "window-private",
              tabId: "tab-private",
            },
          },
        },
      }],
    })
    const route = "POST /api/yeonjang/browser-active-tab-info/pre-dispatch/preview"

    const response = await handlers.get(route)?.({
      body: {
        readyTarget: READY_TARGET,
        approvalReceipt: APPROVAL_RECEIPT,
      },
    }, {})

    expect(response).toEqual({
      status: "prepared",
      reasonCode: "active_tab_info_pre_dispatch_prepared",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      publicTargetName: "Studio Mac",
      platform: "macos",
      observationStatus: "available",
      browserName: "Google Chrome",
      requiredGateCount: 5,
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain("approval-nonce-123")
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("internal-private-instance")
  })
})
