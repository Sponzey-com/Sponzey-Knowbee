import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-candidate-plan.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const ACCEPTED_ADMISSION: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.v1",
  method: "browser.active_tab_info",
  admissionStatus: "accepted",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted",
  reviewedPlanStatus: "ready",
  admissionDecision: "manual_cleanup_branch_execution_admitted",
  requiredExecutionBoundaries: [
    "Use a separate Tidy First cleanup branch only after operator admission.",
  ],
  nextAllowedAction: "prepare_cleanup_deletion_candidate_after_branch_admission",
  runGitNow: false,
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function cleanupDeletionCandidatePlan() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan({
    cleanupBranchExecutionAdmission: ACCEPTED_ADMISSION,
    deletionCandidateRefs: [
      "cleanup-deletion-candidate:active-tab-info:sanitized:unused-ledger-001",
    ],
  })
}

describe("task456 active tab info release evidence chain cleanup deletion candidate plan misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup deletion candidate plan state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T17:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan:
        cleanupDeletionCandidatePlan(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup deletion candidate plan as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan:
          cleanupDeletionCandidatePlan(),
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
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
