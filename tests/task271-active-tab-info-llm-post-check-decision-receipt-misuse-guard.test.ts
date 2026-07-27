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
  buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchVerificationAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-verification-admission.ts"

const READY_VERIFICATION_ADMISSION: YeonjangBrowserActiveTabInfoDispatchVerificationAdmission = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-verification-admission.v1",
  method: "browser.active_tab_info",
  status: "verification_admission_ready",
  reasonCode: "active_tab_info_dispatch_verification_admission_ready",
  admission: {
    verificationAdmissionId: "dispatch-verification-admission:browser.active_tab_info:0f9",
    dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
    redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
    verificationChecklistStatus: "passed",
    llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
  },
  admitNow: true,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

function llmPostCheckDecisionReceipt() {
  return buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt({
    verificationAdmission: READY_VERIFICATION_ADMISSION,
    llmPostCheckDecision: "satisfied",
    goalSatisfactionEvidenceRefs: [
      "runtime-observation:active-tab-info:redacted:001",
      "tool-result:yeonjang:browser-active-tab-info:1234567890abcdef1234567890abcdef1234567890abcdef",
    ],
    decidedAt: "2026-07-22T02:09:00.000Z",
  })
}

describe("task271 active tab info LLM post-check decision receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry LLM post-check decision receipt", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:09:00.000Z"),
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
      yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt: llmPostCheckDecisionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept LLM post-check decision receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt: llmPostCheckDecisionReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
