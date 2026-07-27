import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-pr-checklist.ts"
import {
  type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_INDEX: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupReadinessIndex = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-readiness-index.v1",
  method: "browser.active_tab_info",
  indexStatus: "ready",
  reasonCode: "active_tab_info_release_evidence_chain_cleanup_readiness_index_ready",
  summaryReady: true,
  misuseGuardCoverageStatus: "covered",
  nextAllowedAction: "prepare_separate_tidy_first_cleanup_pr",
  deleteCodeNow: false,
  modifyPackageNow: false,
  releaseReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
}

function cleanupPrChecklist() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist({
    cleanupReadinessIndex: READY_INDEX,
  })
}

describe("task448 active tab info release evidence chain cleanup PR checklist misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup PR checklist state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T15:40:00.000Z"),
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
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist:
        cleanupPrChecklist(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup PR checklist as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist:
          cleanupPrChecklist(),
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
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
