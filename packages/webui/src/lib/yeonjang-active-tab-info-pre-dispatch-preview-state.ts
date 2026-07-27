import type { YeonjangBrowserActiveTabInfoPreDispatchPreview } from "../contracts/yeonjang"
import {
  buildYeonjangActiveTabInfoAdmissionReceiptForCore,
} from "./yeonjang-active-tab-info-admission-adapter"
import type {
  YeonjangActiveTabInfoApprovalReceiptStateProjection,
} from "./yeonjang-active-tab-info-approval-receipt"

export type YeonjangActiveTabInfoPreDispatchPreviewState =
  | {
      status: "ready"
      preview: YeonjangBrowserActiveTabInfoPreDispatchPreview
      message: null
    }
  | {
      status: "error"
      preview: null
      message: string
    }

export interface LoadYeonjangActiveTabInfoPreDispatchPreviewStateInput {
  projection: YeonjangActiveTabInfoApprovalReceiptStateProjection
  nonce: string
  request: (input: unknown, signal?: AbortSignal) => Promise<YeonjangBrowserActiveTabInfoPreDispatchPreview>
  signal?: AbortSignal | undefined
}

export async function loadYeonjangActiveTabInfoPreDispatchPreviewState(
  input: LoadYeonjangActiveTabInfoPreDispatchPreviewStateInput,
): Promise<YeonjangActiveTabInfoPreDispatchPreviewState> {
  const admissionReceipt = buildYeonjangActiveTabInfoAdmissionReceiptForCore({
    projection: input.projection,
    nonce: input.nonce,
  })
  if (!admissionReceipt.ok) {
    return {
      status: "error",
      preview: null,
      message: "실행 전 점검 요청을 만들지 못했습니다.",
    }
  }

  try {
    const preview = await input.request({
      readyTarget: {
        publicTargetName: admissionReceipt.receipt.publicTargetName,
        platform: "unknown",
        method: "browser.active_tab_info",
        requiresApproval: true,
        permissionSetting: "allow_browser_read",
      },
      approvalReceipt: admissionReceipt.receipt,
    }, input.signal)
    return { status: "ready", preview, message: null }
  } catch {
    return {
      status: "error",
      preview: null,
      message: "실행 전 점검 결과를 확인하지 못했습니다.",
    }
  }
}
