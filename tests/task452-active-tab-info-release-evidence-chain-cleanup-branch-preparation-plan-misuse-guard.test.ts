import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const ACCEPTED_RECEIPT: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.v1",
  method: "browser.active_tab_info",
  receiptStatus: "accepted",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted",
  reviewDecision: "cleanup_pr_preparation_accepted",
  reviewedChecklistStatus: "ready",
  nextAllowedAction: "prepare_cleanup_branch_after_review",
  deleteCodeNow: false,
  modifyPackageNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function cleanupBranchPreparationPlan() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan({
    cleanupPrReviewReceipt: ACCEPTED_RECEIPT,
    sanitizedCleanupBranchRef:
      "cleanup-branch-preparation:active-tab-info:sanitized:manual-branch-001",
  })
}

describe("task452 active tab info release evidence chain cleanup branch preparation plan misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup branch preparation plan state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T16:35:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan:
        cleanupBranchPreparationPlan(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup branch preparation plan as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan:
          cleanupBranchPreparationPlan(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: [
        "evidenceRef",
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
