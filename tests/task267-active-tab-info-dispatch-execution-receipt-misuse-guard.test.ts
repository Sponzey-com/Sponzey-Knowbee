import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
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

function dispatchExecutionReceipt() {
  return buildYeonjangBrowserActiveTabInfoDispatchExecutionReceipt({
    dispatchDryRunReceipt: READY_DRY_RUN_RECEIPT,
    operatorFinalDispatchConfirmation: true,
    dispatchExecutionRef: "dispatch-execution:active-tab-info:001",
    executedAt: "2026-07-22T02:08:00.000Z",
    targetSurfaceCount: 2,
    postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
  })
}

describe("task267 active tab info dispatch execution receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry dispatch execution receipt", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:08:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    })
    const evidence = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })

    expect(validateReleaseApprovalEvidenceProjection({
      ...evidence,
      yeonjangBrowserActiveTabInfoDispatchExecutionReceipt: dispatchExecutionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept dispatch execution receipt as final response or product log evidence", () => {
    const redacted = projectYeonjangBrowserActiveTabInfo({
      browserName: "Google Chrome",
      title: "Private Ticket",
      url: "https://example.test/account?token=private",
      observationStatus: "available",
    })
    if (!redacted.ok) throw new Error(redacted.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: redacted.observation,
    })

    expect(buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: {
        ...redacted.observation,
        yeonjangBrowserActiveTabInfoDispatchExecutionReceipt: dispatchExecutionReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoDispatchExecutionReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
