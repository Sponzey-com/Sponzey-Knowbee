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
  buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-authorization.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.ts"

const READY_DRY_RUN_RECEIPT: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1",
  method: "browser.active_tab_info",
  status: "dry_run_receipt_ready",
  reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready",
  dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
  mutationSurfaceCount: 2,
  rollbackDryRunStatus: "passed",
  postCheckDryRunStatus: "passed",
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  createLiveExecutionReceiptNow: false,
}

function liveExecutionAuthorization() {
  return buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization({
    dryRunReceipt: READY_DRY_RUN_RECEIPT,
    operatorFinalLiveAuthorizationProof: "operator-live-proof:release-owner",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    rollbackEmergencyCommandAcknowledged: true,
    postExecutionVerificationAcknowledged: true,
    authorizedAt: "2026-07-22T02:00:00.000Z",
    expiresAt: "2026-07-22T02:10:00.000Z",
  }, {
    now: new Date("2026-07-22T02:05:00.000Z"),
  })
}

describe("task259 active tab info live execution authorization misuse guard", () => {
  it("rejects approval evidence that tries to carry live execution authorization", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:06:00.000Z"),
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
      yeonjangBrowserActiveTabInfoLiveExecutionAuthorization: liveExecutionAuthorization(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept live execution authorization as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoLiveExecutionAuthorization:
          liveExecutionAuthorization(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoLiveExecutionAuthorization"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
