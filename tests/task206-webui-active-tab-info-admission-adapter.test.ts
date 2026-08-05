import { describe, expect, it } from "vitest"

import {
  buildYeonjangActiveTabInfoAdmissionReceiptForCore,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-admission-adapter.js"

describe("Task 206 WebUI active tab info admission adapter", () => {
  it("combines public WebUI projection with an ephemeral nonce into a Core-compatible receipt", () => {
    const result = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: {
        method: "browser.active_tab_info",
        publicTargetName: "Office Windows",
        approvalScope: "allow_for_session",
        approvedAt: "2026-07-22T05:00:00.000Z",
        rawActiveTab: {
          title: "Private Ticket",
          url: "https://example.test/private?token=secret",
        },
        backendFamily: "windows_ui_automation",
        internalInstanceId: "internal-private-instance",
      } as never,
      nonce: "ephemeral-nonce-123",
    })

    expect(result).toEqual({
      ok: true,
      receipt: {
        method: "browser.active_tab_info",
        publicTargetName: "Office Windows",
        approvalScope: "allow_for_session",
        approvedAt: "2026-07-22T05:00:00.000Z",
        nonce: "ephemeral-nonce-123",
      },
      invokeNow: false,
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("windows_ui_automation")
    expect(serialized).not.toContain("internal-private-instance")
  })

  it("fails closed when projection fields or nonce are missing or invalid", () => {
    const projection = {
      method: "browser.active_tab_info" as const,
      publicTargetName: "Office Windows",
      approvalScope: "allow_once" as const,
      approvedAt: "2026-07-22T05:00:00.000Z",
    }

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: null,
      nonce: "ephemeral-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_projection_missing", invokeNow: false })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: { ...projection, method: "browser.focus" as never },
      nonce: "ephemeral-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_method_invalid", invokeNow: false })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: { ...projection, publicTargetName: "  " },
      nonce: "ephemeral-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_target_required", invokeNow: false })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: { ...projection, approvalScope: "deny" as never },
      nonce: "ephemeral-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_scope_invalid", invokeNow: false })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection: { ...projection, approvedAt: "not-a-date" },
      nonce: "ephemeral-nonce-123",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_approved_at_invalid", invokeNow: false })

    expect(buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection,
      nonce: "",
    })).toEqual({ ok: false, reasonCode: "active_tab_info_admission_nonce_required", invokeNow: false })
  })

  it("does not store or expose nonce in WebUI projection input", () => {
    const projection = {
      method: "browser.active_tab_info" as const,
      publicTargetName: "Office Windows",
      approvalScope: "allow_once" as const,
      approvedAt: "2026-07-22T05:00:00.000Z",
    }

    expect(JSON.stringify(projection)).not.toContain("ephemeral-nonce-123")

    const result = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
      projection,
      nonce: "ephemeral-nonce-123",
    })

    expect(result.ok).toBe(true)
    expect(JSON.stringify(projection)).not.toContain("ephemeral-nonce-123")
  })
})
