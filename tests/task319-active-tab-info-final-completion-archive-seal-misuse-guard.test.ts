import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-archive-seal.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT: YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.v1",
  method: "browser.active_tab_info",
  status: "operator_completion_archive_acknowledgement_ready",
  reasonCode:
    "active_tab_info_operator_completion_archive_acknowledgement_ready",
  acknowledgement: {
    operatorCompletionArchiveAcknowledgementId:
      "operator-completion-archive-acknowledgement:browser.active_tab_info:76c",
    finalOperatorArchiveCompletionMarkerId:
      "final-operator-archive-completion-marker:browser.active_tab_info:d47",
    sanitizedOperatorCompletionArchiveAcknowledgementRef:
      "operator-completion-archive-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorCompletionArchiveAcknowledgementRef:
      "operator-completion-archive:active-tab-info:ack:001",
    acknowledgementStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalCompletionArchiveSeal() {
  return buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal({
    operatorCompletionArchiveAcknowledgement:
      READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT,
    sanitizedFinalCompletionArchiveSealRef:
      "final-completion-archive-seal:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalCompletionArchiveAcknowledgementRef:
      "final-completion-archive:active-tab-info:ack:001",
  })
}

describe("task319 active tab info final completion archive seal misuse guard", () => {
  it("rejects approval evidence that tries to carry final completion archive seal state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T00:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal:
        finalCompletionArchiveSeal(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final completion archive seal as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal:
          finalCompletionArchiveSeal(),
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
        "yeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
