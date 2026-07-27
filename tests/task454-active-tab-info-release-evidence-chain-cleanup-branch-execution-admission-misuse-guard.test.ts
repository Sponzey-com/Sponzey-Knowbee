import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-execution-admission.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_PLAN: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-branch-preparation-plan.v1",
  method: "browser.active_tab_info",
  planStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready",
  reviewedReceiptStatus: "accepted",
  requiredBranchSteps: [
    "Create a separate Tidy First cleanup branch after confirming the accepted cleanup PR review receipt.",
  ],
  requiredVerificationCommands: ["pnpm --filter @knowbee/core build"],
  rollbackNotes: ["Revert only the separate cleanup branch if release gate evidence changes unexpectedly."],
  nextAllowedAction: "create_separate_cleanup_branch_manually",
  deleteCodeNow: false,
  modifyPackageNow: false,
  createBranchNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function cleanupBranchExecutionAdmission() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission({
    cleanupBranchPreparationPlan: READY_PLAN,
    operatorExecutionAdmissionRef:
      "cleanup-branch-execution-admission:active-tab-info:operator-accepted:manual-001",
  })
}

describe("task454 active tab info release evidence chain cleanup branch execution admission misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup branch execution admission state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T17:05:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission:
        cleanupBranchExecutionAdmission(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup branch execution admission as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission:
          cleanupBranchExecutionAdmission(),
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
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
