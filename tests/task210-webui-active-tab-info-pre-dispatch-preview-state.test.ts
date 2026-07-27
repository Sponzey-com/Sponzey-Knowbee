import { describe, expect, it } from "vitest"

import {
  loadYeonjangActiveTabInfoPreDispatchPreviewState,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-pre-dispatch-preview-state.js"

const projection = {
  method: "browser.active_tab_info" as const,
  publicTargetName: "Office Windows",
  approvalScope: "allow_once" as const,
  approvedAt: "2026-07-22T05:00:00.000Z",
}

describe("Task 210 WebUI active tab info pre-dispatch preview state", () => {
  it("builds a minimal preview request from public projection and ephemeral nonce", async () => {
    let capturedInput: unknown
    const state = await loadYeonjangActiveTabInfoPreDispatchPreviewState({
      projection,
      nonce: "ephemeral-nonce-123",
      request: async (input) => {
        capturedInput = input
        return {
          status: "blocked",
          reasonCode: "active_tab_info_backend_criteria_required",
          method: "browser.active_tab_info",
          toolName: "yeonjang_browser_active_tab_info",
          invokeNow: false,
          addRustDispatchNow: false,
          addProductionBindingNow: false,
        }
      },
    })

    expect(state).toEqual({
      status: "ready",
      preview: {
        status: "blocked",
        reasonCode: "active_tab_info_backend_criteria_required",
        method: "browser.active_tab_info",
        toolName: "yeonjang_browser_active_tab_info",
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
      },
      message: null,
    })
    expect(capturedInput).toEqual({
      readyTarget: {
        publicTargetName: "Office Windows",
        platform: "unknown",
        method: "browser.active_tab_info",
        requiresApproval: true,
        permissionSetting: "allow_browser_read",
      },
      approvalReceipt: {
        method: "browser.active_tab_info",
        publicTargetName: "Office Windows",
        approvalScope: "allow_once",
        approvedAt: "2026-07-22T05:00:00.000Z",
        nonce: "ephemeral-nonce-123",
      },
    })
  })

  it("does not include raw browser or internal data in the stored state", async () => {
    const state = await loadYeonjangActiveTabInfoPreDispatchPreviewState({
      projection: {
        ...projection,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/account?token=private",
        },
        internalInstanceId: "internal-private-instance",
        backendFamily: "windows_ui_automation",
      } as never,
      nonce: "ephemeral-nonce-123",
      request: async () => ({
        status: "prepared",
        reasonCode: "active_tab_info_pre_dispatch_prepared",
        method: "browser.active_tab_info",
        toolName: "yeonjang_browser_active_tab_info",
        publicTargetName: "Office Windows",
        platform: "windows",
        observationStatus: "available",
        browserName: "Google Chrome",
        requiredGateCount: 5,
        invokeNow: false,
        addRustDispatchNow: false,
        addProductionBindingNow: false,
      }),
    })

    const serialized = JSON.stringify(state)
    expect(serialized).not.toContain("ephemeral-nonce-123")
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("internal-private-instance")
    expect(serialized).not.toContain("windows_ui_automation")
  })

  it("fails closed before request when adapter input is invalid", async () => {
    let called = false
    const state = await loadYeonjangActiveTabInfoPreDispatchPreviewState({
      projection,
      nonce: "",
      request: async () => {
        called = true
        throw new Error("should not call request")
      },
    })

    expect(called).toBe(false)
    expect(state).toEqual({
      status: "error",
      preview: null,
      message: "실행 전 점검 요청을 만들지 못했습니다.",
    })
  })
})
