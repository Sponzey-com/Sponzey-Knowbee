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
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.v1",
  method: "browser.active_tab_info",
  candidatePlanStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready",
  reviewedAdmissionStatus: "accepted",
  candidateCount: 1,
  candidateRefs: ["cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001"],
  requiredDeletionReviewSteps: [
    "Review every sanitized cleanup deletion candidate before opening a separate Tidy First cleanup task.",
  ],
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

function cleanupDeletionDryRunReceipt() {
  const cleanupDeletionReviewReceipt =
    buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt({
      cleanupDeletionCandidatePlan: READY_CANDIDATE_PLAN,
      operatorReviewReceiptRef:
        "cleanup-deletion-review-receipt:active-tab-info:sanitized:operator-review-001",
    })
  const cleanupDeletionExecutionAdmission =
    buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission({
      cleanupDeletionReviewReceipt,
      operatorExecutionAdmissionRef:
        "cleanup-deletion-execution-admission:active-tab-info:operator:admission-001",
    })

  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt({
    cleanupDeletionExecutionAdmission,
    operatorDryRunReceiptRef:
      "cleanup-deletion-dry-run-receipt:active-tab-info:sanitized:dry-run-001",
    sanitizedDeletionCandidateRefs: [
      "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
    ],
    requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
    rollbackNotes: ["Restore from the retained cleanup review receipt before retrying."],
  })
}

describe("task462 active tab info release evidence chain cleanup deletion dry-run receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup deletion dry-run receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T18:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt:
        cleanupDeletionDryRunReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup deletion dry-run receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt:
          cleanupDeletionDryRunReceipt(),
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
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
