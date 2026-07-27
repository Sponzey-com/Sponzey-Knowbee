import { describe, expect, it } from "vitest"

import { evaluateYeonjangBrowserActiveTabInfoAdmissionGate } from "../packages/core/src/release/yeonjang-browser-active-tab-info-pre-dispatch-bridge.ts"
import { buildYeonjangActiveTabInfoAdmissionReceiptForCore } from "../packages/webui/src/lib/yeonjang-active-tab-info-admission-adapter.js"

const READY_TARGET = {
  publicTargetName: "Office Windows",
  platform: "windows" as const,
  method: "browser.active_tab_info" as const,
  requiresApproval: true,
  permissionSetting: "allow_browser_read" as const,
}

const APPROVAL_PROJECTION = {
  method: "browser.active_tab_info" as const,
  publicTargetName: "Office Windows",
  approvalScope: "allow_once" as const,
  approvedAt: "2026-07-22T05:00:00.000Z",
}

describe("Task 207 WebUI/Core active tab info admission dry-run", () => {
  it("passes the WebUI adapter receipt through the Core admission gate without invoking dispatch", () => {
    const adapter = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: APPROVAL_PROJECTION,
      nonce: "ephemeral-nonce-123",
    })
    if (!adapter.ok) throw new Error(adapter.reasonCode)

    const gate = evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
      readyTarget: READY_TARGET,
      approvalReceipt: adapter.receipt,
      now: "2026-07-22T05:00:01.000Z",
      maxAgeMs: 60_000,
    })

    expect(gate).toEqual({
      status: "approved",
      reasonCode: "active_tab_info_approval_admitted",
      method: "browser.active_tab_info",
      publicTargetName: "Office Windows",
      approvalScope: "allow_once",
      invokeNow: false,
    })
  })

  it("keeps Core gate blockers intact for target mismatch and expired receipts", () => {
    const adapter = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: APPROVAL_PROJECTION,
      nonce: "ephemeral-nonce-123",
    })
    if (!adapter.ok) throw new Error(adapter.reasonCode)

    expect(evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
      readyTarget: { ...READY_TARGET, publicTargetName: "Studio Mac" },
      approvalReceipt: adapter.receipt,
      now: "2026-07-22T05:00:01.000Z",
      maxAgeMs: 60_000,
    })).toMatchObject({
      status: "target_mismatch",
      reasonCode: "active_tab_info_approval_target_mismatch",
      method: "browser.active_tab_info",
      publicTargetName: "Office Windows",
      invokeNow: false,
    })

    expect(evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
      readyTarget: READY_TARGET,
      approvalReceipt: adapter.receipt,
      now: "2026-07-22T05:02:01.000Z",
      maxAgeMs: 60_000,
    })).toMatchObject({
      status: "expired",
      reasonCode: "active_tab_info_approval_expired",
      method: "browser.active_tab_info",
      publicTargetName: "Office Windows",
      invokeNow: false,
    })
  })

  it("fails before Core gate when nonce or method are invalid", () => {
    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: APPROVAL_PROJECTION,
      nonce: "",
    })).toEqual({
      ok: false,
      reasonCode: "active_tab_info_admission_nonce_required",
      invokeNow: false,
    })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: { ...APPROVAL_PROJECTION, method: "browser.focus" as never },
      nonce: "ephemeral-nonce-123",
    })).toEqual({
      ok: false,
      reasonCode: "active_tab_info_admission_method_invalid",
      invokeNow: false,
    })
  })

  it("does not expose WebUI-only raw data or nonce outside the dry-run receipt", () => {
    const adapter = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: {
        ...APPROVAL_PROJECTION,
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/private?token=secret",
          profilePath: "/Users/example/Profile 1",
          windowId: "window-private",
          tabId: "tab-private",
        },
        backendFamily: "windows_ui_automation",
        internalInstanceId: "internal-private-instance",
      } as never,
      nonce: "ephemeral-nonce-123",
    })
    if (!adapter.ok) throw new Error(adapter.reasonCode)

    const gate = evaluateYeonjangBrowserActiveTabInfoAdmissionGate({
      readyTarget: READY_TARGET,
      approvalReceipt: adapter.receipt,
      now: "2026-07-22T05:00:01.000Z",
      maxAgeMs: 60_000,
    })

    expect(JSON.stringify(gate)).not.toContain("ephemeral-nonce-123")
    expect(JSON.stringify(gate)).not.toContain("Private Ticket")
    expect(JSON.stringify(gate)).not.toContain("token=secret")
    expect(JSON.stringify(gate)).not.toContain("Profile 1")
    expect(JSON.stringify(gate)).not.toContain("window-private")
    expect(JSON.stringify(gate)).not.toContain("tab-private")
    expect(JSON.stringify(gate)).not.toContain("windows_ui_automation")
    expect(JSON.stringify(gate)).not.toContain("internal-private-instance")
  })
})
