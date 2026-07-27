import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.ts"

const READY_DRY_RUN_RECEIPT: YeonjangBrowserActiveTabInfoDispatchDryRunReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.v1",
  method: "browser.active_tab_info",
  status: "dispatch_dry_run_receipt_ready",
  reasonCode: "active_tab_info_dispatch_dry_run_receipt_ready",
  dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
  liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
  targetSurfaceCount: 2,
  dispatchAdapterDryRunStatus: "passed",
  rollbackDryRunStatus: "passed",
  postCheckDryRunStatus: "passed",
  dispatchNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

describe("task266 active tab info dispatch execution receipt", () => {
  it("builds a redacted dispatch execution receipt without downstream activation", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt({
      dispatchDryRunReceipt: READY_DRY_RUN_RECEIPT,
      operatorFinalDispatchConfirmation: true,
      dispatchExecutionRef: "dispatch-execution:active-tab-info:001",
      executedAt: "2026-07-22T02:08:00.000Z",
      targetSurfaceCount: 2,
      postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-receipt.v1",
      method: "browser.active_tab_info",
      status: "dispatch_execution_receipt_ready",
      reasonCode: "active_tab_info_dispatch_execution_receipt_ready",
      receipt: {
        dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
        dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
        liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
        targetSurfaceCount: 2,
        executedAt: "2026-07-22T02:08:00.000Z",
        postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
      },
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      markUserGoalSucceededNow: false,
    })
  })

  it("blocks missing dry-run readiness, confirmation, unsafe refs, invalid dates, and surface mismatch", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt({
      dispatchDryRunReceipt: {
        ...READY_DRY_RUN_RECEIPT,
        status: "blocked",
      },
      operatorFinalDispatchConfirmation: false,
      dispatchExecutionRef: "https://dispatch.example",
      executedAt: "invalid",
      targetSurfaceCount: 3,
      postDispatchRedactedResultRef: "/Users/private/result",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_dispatch_execution_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "dispatch_execution_receipt_dry_run_receipt_not_ready",
      "dispatch_execution_receipt_operator_final_confirmation_missing",
      "dispatch_execution_receipt_execution_ref_invalid",
      "dispatch_execution_receipt_executed_at_invalid",
      "dispatch_execution_receipt_surface_count_mismatch",
      "dispatch_execution_receipt_redacted_result_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
    expect(receipt.enableSkillMappingNow).toBe(false)
  })

  it("does not expose raw target ids, operator proof, browser data, downstream ids, or success claims", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt({
      dispatchDryRunReceipt: READY_DRY_RUN_RECEIPT,
      operatorFinalDispatchConfirmation: true,
      dispatchExecutionRef: "dispatch-execution:active-tab-info:001",
      executedAt: "2026-07-22T02:08:00.000Z",
      targetSurfaceCount: 2,
      postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /knowbee-instance|operator-live-proof|https?:\/\/|\/Users\/|token=|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
