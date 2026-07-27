import type {
  YeonjangActiveTabInfoApprovalReceipt,
  YeonjangActiveTabInfoApprovalReceiptStateProjection,
} from "./yeonjang-active-tab-info-approval-receipt"

export type YeonjangActiveTabInfoAdmissionAdapterReasonCode =
  | "active_tab_info_admission_projection_missing"
  | "active_tab_info_admission_method_invalid"
  | "active_tab_info_admission_target_required"
  | "active_tab_info_admission_scope_invalid"
  | "active_tab_info_admission_approved_at_invalid"
  | "active_tab_info_admission_nonce_required"

export type YeonjangActiveTabInfoAdmissionAdapterResult =
  | {
      ok: true
      receipt: YeonjangActiveTabInfoApprovalReceipt
      invokeNow: false
    }
  | {
      ok: false
      reasonCode: YeonjangActiveTabInfoAdmissionAdapterReasonCode
      invokeNow: false
    }

export interface BuildYeonjangActiveTabInfoAdmissionReceiptForCoreInput {
  projection: YeonjangActiveTabInfoApprovalReceiptStateProjection | null | undefined
  nonce: string | null | undefined
}

export function buildYeonjangActiveTabInfoAdmissionReceiptForCore(
  input: BuildYeonjangActiveTabInfoAdmissionReceiptForCoreInput,
): YeonjangActiveTabInfoAdmissionAdapterResult {
  const projection = input.projection
  if (!projection) {
    return fail("active_tab_info_admission_projection_missing")
  }
  if (projection.method !== "browser.active_tab_info") {
    return fail("active_tab_info_admission_method_invalid")
  }

  const publicTargetName = projection.publicTargetName.trim()
  if (!publicTargetName) {
    return fail("active_tab_info_admission_target_required")
  }
  if (
    projection.approvalScope !== "allow_once" &&
    projection.approvalScope !== "allow_for_session"
  ) {
    return fail("active_tab_info_admission_scope_invalid")
  }
  if (!Number.isFinite(Date.parse(projection.approvedAt))) {
    return fail("active_tab_info_admission_approved_at_invalid")
  }

  const nonce = (input.nonce ?? "").trim()
  if (!nonce) {
    return fail("active_tab_info_admission_nonce_required")
  }

  return {
    ok: true,
    receipt: {
      method: "browser.active_tab_info",
      publicTargetName,
      approvalScope: projection.approvalScope,
      approvedAt: new Date(projection.approvedAt).toISOString(),
      nonce,
    },
    invokeNow: false,
  }
}

function fail(
  reasonCode: YeonjangActiveTabInfoAdmissionAdapterReasonCode,
): YeonjangActiveTabInfoAdmissionAdapterResult {
  return { ok: false, reasonCode, invokeNow: false }
}
