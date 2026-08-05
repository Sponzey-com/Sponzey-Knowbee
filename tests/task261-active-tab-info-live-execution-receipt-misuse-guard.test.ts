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
  buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-authorization.ts"

const READY_AUTHORIZATION: YeonjangBrowserActiveTabInfoLiveExecutionAuthorization = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-authorization.v1",
  method: "browser.active_tab_info",
  status: "live_execution_authorization_ready",
  reasonCode: "active_tab_info_live_execution_authorization_ready",
  authorization: {
    authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
    dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    rollbackEmergencyCommandAcknowledged: true,
    postExecutionVerificationAcknowledged: true,
    authorizedAt: "2026-07-22T02:00:00.000Z",
    expiresAt: "2026-07-22T02:10:00.000Z",
  },
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  createLiveExecutionReceiptNow: false,
}

function liveExecutionReceipt() {
  return buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt({
    liveExecutionAuthorization: READY_AUTHORIZATION,
    targetInstanceId: "knowbee-instance:studio-mac",
    runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
    operatorExecutionWindow: {
      startsAt: "2026-07-22T02:06:00.000Z",
      expiresAt: "2026-07-22T02:09:00.000Z",
    },
    rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
    postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
  }, {
    now: new Date("2026-07-22T02:07:00.000Z"),
  })
}

describe("task261 active tab info live execution receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry live execution receipt", () => {
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
      yeonjangBrowserActiveTabInfoLiveExecutionReceipt: liveExecutionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept live execution receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoLiveExecutionReceipt: liveExecutionReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoLiveExecutionReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
