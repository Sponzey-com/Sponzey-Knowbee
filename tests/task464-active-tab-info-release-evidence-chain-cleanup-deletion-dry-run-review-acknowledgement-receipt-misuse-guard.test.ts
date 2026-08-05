import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-review-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_CANDIDATE_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
  method: "browser.active_tab_info",
  candidatePlanStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
  reviewedAdmissionStatus: "accepted",
  candidateCount: 1,
  candidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
  requiredDeletionReviewSteps: ["Review the sanitized candidate before a separate Tidy First task."],
  requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
  nextAllowedAction: "review_cleanup_deletion_candidate_plan",
  runGitNow: false,
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function acknowledgementReceipt() {
  const reviewReceipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
    cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
    operatorReviewReceiptRef: "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
  })
  const executionAdmission = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
    cleanupDeletionReviewReceipt: reviewReceipt,
    operatorExecutionAdmissionRef:
      "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
  })
  const dryRunReceipt = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
    cleanupDeletionExecutionAdmission: executionAdmission,
    operatorDryRunReceiptRef: "cleanup-deletion-dry-run-receipt:active-tab-info:sanitized:dry-run-001",
    sanitizedDeletionCandidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
    requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
    rollbackNotes: ["Restore from the retained review receipt before retrying."],
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt({
    cleanupDeletionDryRunReceipt: dryRunReceipt,
    sanitizedOperatorAcknowledgementRef:
      "cleanup-deletion-dry-run-acknowledgement:active-tab-info:sanitized:operator-ack-001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:dry-run-review-001",
    operatorReviewAcknowledgementRef:
      "cleanup-deletion-dry-run-review-acknowledgement:active-tab-info:sanitized:review-ack-001",
  })
}

describe("task464 active tab info cleanup deletion dry-run review acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that treats the acknowledgement receipt as deletion execution or release readiness evidence", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T18:30:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: { moduleEvidence: [], testEvidence: [] },
    })
    const evidence = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })

    expect(validateReleaseApprovalEvidenceProjection({
      ...evidence,
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt:
        acknowledgementReceipt(),
    })).toEqual({ status: "rejected", reasonCode: "release_approval_evidence_invalid" })
  })

  it("does not accept the acknowledgement receipt as a final result or product log projection", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt:
          acknowledgementReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({ ok: false, reasonCode: "final_result_redaction_required" })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: [
        "evidenceRef",
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt",
      ],
    })).toEqual({ ok: false, reasonCode: "product_log_evidence_ref_only" })
  })
})
