import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-notice.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-handoff-bundle.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_AUDIT_HANDOFF_BUNDLE: YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-handoff-bundle.v1",
  method: "browser.active_tab_info",
  status: "final_audit_handoff_bundle_ready",
  reasonCode: "active_tab_info_final_audit_handoff_bundle_ready",
  bundle: {
    finalAuditHandoffBundleId: "final-audit-handoff-bundle:browser.active_tab_info:20b",
    finalCloseoutLedgerId: "final-closeout-ledger:browser.active_tab_info:0b3",
    sanitizedAuditArtifactDescriptorRef: "audit-artifact-descriptor:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    releaseSurfaceMatrixAcknowledgementRef: "release-surface-matrix:active-tab-info:ack:001",
    handoffStatus: "handoff_ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorCompletionNotice() {
  return buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice({
    finalAuditHandoffBundle: READY_FINAL_AUDIT_HANDOFF_BUNDLE,
    sanitizedOperatorNoticeRef: "operator-completion-notice:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    userVisibleResponseAcknowledgementRef: "user-visible-response:active-tab-info:ack:001",
  })
}

describe("task289 active tab info operator completion notice misuse guard", () => {
  it("rejects approval evidence that tries to carry operator completion notice state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorCompletionNotice: operatorCompletionNotice(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator completion notice as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorCompletionNotice: operatorCompletionNotice(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoOperatorCompletionNotice"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
