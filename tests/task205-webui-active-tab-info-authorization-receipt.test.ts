import { describe, expect, it } from "vitest"

import {
  createYeonjangActiveTabInfoApprovalReceipt,
  projectYeonjangActiveTabInfoApprovalReceiptForState,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-approval-receipt.js"

describe("Task 205 WebUI active tab info authorization receipt", () => {
  it("creates a local admission receipt without invoking runtime dispatch", () => {
    const receipt = createYeonjangActiveTabInfoApprovalReceipt({
      action: {
        userAction: "enable_browser_read_permission",
        label: "브라우저 읽기 권한 허용",
        targetName: "Office Windows",
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
      approvalScope: "allow_once",
      now: "2026-07-22T05:00:00.000Z",
      nonce: "receipt-nonce-123",
    })

    expect(receipt).toEqual({
      ok: true,
      receipt: {
        method: "browser.active_tab_info",
        publicTargetName: "Office Windows",
        approvalScope: "allow_once",
        approvedAt: "2026-07-22T05:00:00.000Z",
        nonce: "receipt-nonce-123",
      },
      invokeNow: false,
    })

    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("windows_ui_automation")
    expect(serialized).not.toContain("internal-private-instance")
  })

  it("rejects invalid target, time, nonce, and approval scope before creating a receipt", () => {
    const action = {
      userAction: "enable_browser_read_permission" as const,
      label: "Enable browser read permission",
      targetName: "Office Windows",
    }

    expect(createYeonjangActiveTabInfoApprovalReceipt({
      action: { ...action, targetName: "" },
      approvalScope: "allow_once",
      now: "2026-07-22T05:00:00.000Z",
      nonce: "receipt-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_receipt_target_required", invokeNow: false })

    expect(createYeonjangActiveTabInfoApprovalReceipt({
      action,
      approvalScope: "allow_everything" as never,
      now: "2026-07-22T05:00:00.000Z",
      nonce: "receipt-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_receipt_scope_invalid", invokeNow: false })

    expect(createYeonjangActiveTabInfoApprovalReceipt({
      action,
      approvalScope: "allow_once",
      now: "not-a-date",
      nonce: "receipt-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_receipt_time_invalid", invokeNow: false })

    expect(createYeonjangActiveTabInfoApprovalReceipt({
      action,
      approvalScope: "allow_once",
      now: "2026-07-22T05:00:00.000Z",
      nonce: "",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_receipt_nonce_required", invokeNow: false })
  })

  it("projects receipt state without nonce or raw internals", () => {
    const receipt = createYeonjangActiveTabInfoApprovalReceipt({
      action: {
        userAction: "enable_browser_read_permission",
        label: "브라우저 읽기 권한 허용",
        targetName: "Office Windows",
      },
      approvalScope: "allow_once",
      now: "2026-07-22T05:00:00.000Z",
      nonce: "receipt-nonce-123",
    })
    if (!receipt.ok) throw new Error(receipt.reasonCode)

    const projection = projectYeonjangActiveTabInfoApprovalReceiptForState(receipt.receipt)

    expect(projection).toEqual({
      method: "browser.active_tab_info",
      publicTargetName: "Office Windows",
      approvalScope: "allow_once",
      approvedAt: "2026-07-22T05:00:00.000Z",
    })
    expect(JSON.stringify(projection)).not.toContain("receipt-nonce-123")
  })
})
