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
  buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-verification-admission.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-receipt.ts"

const READY_DISPATCH_EXECUTION_RECEIPT: YeonjangBrowserActiveTabInfoDispatchExecutionReceipt = {
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
}

function verificationAdmission() {
  return buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission({
    dispatchExecutionReceipt: READY_DISPATCH_EXECUTION_RECEIPT,
    redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
    llmVerificationDecision: "verified",
    llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
    verificationChecklistStatus: "passed",
  })
}

describe("task269 active tab info dispatch verification admission misuse guard", () => {
  it("rejects approval evidence that tries to carry dispatch verification admission", () => {
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
      yeonjangBrowserActiveTabInfoDispatchVerificationAdmission: verificationAdmission(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept dispatch verification admission as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoDispatchVerificationAdmission: verificationAdmission(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoDispatchVerificationAdmission"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
