import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-review-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_CHECKLIST: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.v1",
  method: "browser.active_tab_info",
  checklistStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready",
  requiredReviewSteps: [
    "Confirm cleanup readiness index is ready and audit-only.",
    "Open a separate Tidy First cleanup PR without release activation changes.",
    "Review removed contracts against active release gate command coverage.",
  ],
  requiredTestCommands: [
    "pnpm exec vitest run ./tests/task446-active-tab-info-release-evidence-chain-cleanup-readiness-index-misuse-guard.test.ts ./tests/task445-active-tab-info-release-evidence-chain-cleanup-readiness-index.test.ts",
    "pnpm --filter @knowbee/core build",
  ],
  rollbackNotes: [
    "Revert only the separate cleanup PR if release gate coverage changes unexpectedly.",
    "Do not enable Skill mapping, production binding, or default live smoke during cleanup rollback.",
  ],
  nextAllowedAction: "open_cleanup_pr_after_manual_review",
  deleteCodeNow: false,
  modifyPackageNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function cleanupPrReviewReceipt() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt({
    cleanupPrChecklist: READY_CHECKLIST,
    operatorReviewRef: "cleanup-pr-review:active-tab-info:operator-accepted:manual-review-001",
  })
}

describe("task450 active tab info release evidence chain cleanup PR review receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup PR review receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T16:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt:
        cleanupPrReviewReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup PR review receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt:
          cleanupPrReviewReceipt(),
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
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
