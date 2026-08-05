import type { YeonjangActiveTabInfoPrimaryActionView } from "./yeonjang-active-tab-info-readiness-view"

export type YeonjangActiveTabInfoApprovalScope = "allow_once" | "allow_for_session" | "deny"

export interface YeonjangActiveTabInfoApprovalReceipt {
  method: "browser.active_tab_info"
  publicTargetName: string
  approvalScope: YeonjangActiveTabInfoApprovalScope
  approvedAt: string
  nonce: string
}

export type YeonjangActiveTabInfoApprovalReceiptReasonCode =
  | "active_tab_info_receipt_target_required"
  | "active_tab_info_receipt_scope_invalid"
  | "active_tab_info_receipt_time_invalid"
  | "active_tab_info_receipt_nonce_required"

export type YeonjangActiveTabInfoApprovalReceiptResult =
  | {
      ok: true
      receipt: YeonjangActiveTabInfoApprovalReceipt
      invokeNow: false
    }
  | {
      ok: false
      reasonCode: YeonjangActiveTabInfoApprovalReceiptReasonCode
      invokeNow: false
    }

export interface CreateYeonjangActiveTabInfoApprovalReceiptInput {
  action: YeonjangActiveTabInfoPrimaryActionView
  approvalScope: YeonjangActiveTabInfoApprovalScope
  now?: string | Date | number | undefined
  nonce?: string | undefined
}

export interface YeonjangActiveTabInfoApprovalReceiptStateProjection {
  method: "browser.active_tab_info"
  publicTargetName: string
  approvalScope: Exclude<YeonjangActiveTabInfoApprovalScope, "deny">
  approvedAt: string
}

export function createYeonjangActiveTabInfoApprovalReceipt(
  input: CreateYeonjangActiveTabInfoApprovalReceiptInput,
): YeonjangActiveTabInfoApprovalReceiptResult {
  const publicTargetName = input.action.targetName.trim()
  if (!publicTargetName) {
    return { ok: false, reasonCode: "active_tab_info_receipt_target_required", invokeNow: false }
  }
  if (!isApprovalScope(input.approvalScope)) {
    return { ok: false, reasonCode: "active_tab_info_receipt_scope_invalid", invokeNow: false }
  }

  const approvedAt = normalizeApprovedAt(input.now)
  if (!approvedAt) {
    return { ok: false, reasonCode: "active_tab_info_receipt_time_invalid", invokeNow: false }
  }

  const nonce = (input.nonce ?? globalThis.crypto?.randomUUID?.() ?? "").trim()
  if (!nonce) {
    return { ok: false, reasonCode: "active_tab_info_receipt_nonce_required", invokeNow: false }
  }

  return {
    ok: true,
    receipt: {
      method: "browser.active_tab_info",
      publicTargetName,
      approvalScope: input.approvalScope,
      approvedAt,
      nonce,
    },
    invokeNow: false,
  }
}

export function projectYeonjangActiveTabInfoApprovalReceiptForState(
  receipt: YeonjangActiveTabInfoApprovalReceipt & {
    approvalScope: Exclude<YeonjangActiveTabInfoApprovalScope, "deny">
  },
): YeonjangActiveTabInfoApprovalReceiptStateProjection {
  return {
    method: "browser.active_tab_info",
    publicTargetName: receipt.publicTargetName,
    approvalScope: receipt.approvalScope,
    approvedAt: receipt.approvedAt,
  }
}

function isApprovalScope(value: unknown): value is YeonjangActiveTabInfoApprovalScope {
  return value === "allow_once" || value === "allow_for_session" || value === "deny"
}

function normalizeApprovedAt(value: string | Date | number | undefined): string | null {
  const date = value === undefined ? new Date() : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}
