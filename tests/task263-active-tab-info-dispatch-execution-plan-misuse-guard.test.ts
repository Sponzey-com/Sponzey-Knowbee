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
  buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-plan.ts"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-receipt.ts"

const READY_RECEIPT: YeonjangBrowserActiveTabInfoLiveExecutionReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1",
  method: "browser.active_tab_info",
  status: "live_execution_receipt_ready",
  reasonCode: "active_tab_info_live_execution_receipt_ready",
  receipt: {
    liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
    authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
    dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
    targetInstanceRef: "target-instance:browser.active_tab_info:22d",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
    executionWindow: {
      startsAt: "2026-07-22T02:06:00.000Z",
      expiresAt: "2026-07-22T02:09:00.000Z",
    },
    rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
    postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
  },
  dispatchNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

function dispatchExecutionPlan() {
  return buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan({
    liveExecutionReceipt: READY_RECEIPT,
    dispatchTransportReady: true,
    targetSurfaceLockAcquired: true,
    rollbackExecutorAvailable: true,
    postCheckExecutorAvailable: true,
    cancelRequested: false,
  })
}

describe("task263 active tab info dispatch execution plan misuse guard", () => {
  it("rejects approval evidence that tries to carry dispatch execution plan", () => {
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
      yeonjangBrowserActiveTabInfoDispatchExecutionPlan: dispatchExecutionPlan(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept dispatch execution plan as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoDispatchExecutionPlan: dispatchExecutionPlan(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoDispatchExecutionPlan"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
