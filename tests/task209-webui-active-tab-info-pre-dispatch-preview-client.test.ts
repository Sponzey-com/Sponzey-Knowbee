import { beforeEach, describe, expect, it, vi } from "vitest"

import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import {
  parseYeonjangBrowserActiveTabInfoPreDispatchPreview,
} from "../packages/webui/src/contracts/yeonjang.js"

const preparedResponse = {
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
  nonce: "approval-nonce-123",
  rawActiveTab: {
    title: "Private Ticket",
    url: "https://example.test/account?token=private",
    profilePath: "/Users/example/Profile 1",
    windowId: "window-private",
    tabId: "tab-private",
  },
  internalInstanceId: "internal-private-instance",
  backendFamily: "accessibility_api",
  rawRegistryRow: { token: "registry-secret" },
}

const blockedResponse = {
  status: "blocked",
  reasonCode: "active_tab_info_approval_required",
  method: "browser.active_tab_info",
  toolName: "yeonjang_browser_active_tab_info",
  invokeNow: false,
  addRustDispatchNow: false,
  addProductionBindingNow: false,
  nonce: "approval-nonce-123",
}

describe("Task 209 WebUI active tab info pre-dispatch preview client", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("parses only public-safe prepared preview fields", () => {
    const parsed = parseYeonjangBrowserActiveTabInfoPreDispatchPreview(preparedResponse)

    expect(parsed).toEqual({
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
    expect(JSON.stringify(parsed)).not.toMatch(
      /approval-nonce-123|Private Ticket|token=private|Profile 1|window-private|tab-private|internal-private-instance|accessibility_api|rawRegistryRow|registry-secret/u,
    )
  })

  it("parses only public-safe blocked preview fields", () => {
    const parsed = parseYeonjangBrowserActiveTabInfoPreDispatchPreview(blockedResponse)

    expect(parsed).toEqual({
      status: "blocked",
      reasonCode: "active_tab_info_approval_required",
      method: "browser.active_tab_info",
      toolName: "yeonjang_browser_active_tab_info",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(parsed)).not.toContain("approval-nonce-123")
  })

  it("calls the pre-dispatch preview endpoint with POST and does not preserve raw response fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => preparedResponse,
    })
    vi.stubGlobal("fetch", fetchMock)
    const body = {
      readyTarget: { publicTargetName: "Studio Mac" },
      approvalReceipt: { nonce: "approval-nonce-123" },
    }

    const result = await localAdapter.previewYeonjangBrowserActiveTabInfoPreDispatch(body)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/yeonjang/browser-active-tab-info/pre-dispatch/preview",
    )
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST")
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(body))
    expect(result.status).toBe("prepared")
    expect(JSON.stringify(result)).not.toMatch(/approval-nonce-123|rawActiveTab|rawRegistryRow|token=private/u)
  })

  it("rejects invalid dispatch flags instead of normalizing them", () => {
    expect(() =>
      parseYeonjangBrowserActiveTabInfoPreDispatchPreview({
        ...preparedResponse,
        invokeNow: true,
      }),
    ).toThrow(/invokeNow/u)
  })
})
