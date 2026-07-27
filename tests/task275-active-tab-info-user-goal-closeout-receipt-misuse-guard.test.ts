import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-response-delivery-gate.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-user-goal-closeout-receipt.ts"

const READY_FINAL_RESPONSE_DELIVERY_GATE: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-response-delivery-gate.v1",
  method: "browser.active_tab_info",
  status: "final_response_delivery_gate_ready",
  reasonCode: "active_tab_info_final_response_delivery_gate_ready",
  gate: {
    finalDeliveryGateId: "final-response-delivery-gate:browser.active_tab_info:8c7",
    llmPostCheckDecisionReceiptId: "llm-post-check-decision-receipt:browser.active_tab_info:c09",
    decisionStatus: "satisfied",
    finalResponseProjectionRef: "final-response-projection:active-tab-info:redacted:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    deliveryChannelAcknowledgementStatus: "acknowledged",
  },
  deliverFinalResponseNow: true,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

function userGoalCloseoutReceipt() {
  return buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt({
    finalResponseDeliveryGate: READY_FINAL_RESPONSE_DELIVERY_GATE,
    userVisibleFinalResponseAcknowledgementRef: "user-visible-final-response:active-tab-info:ack:001",
    llmResultSatisfactionDecision: "satisfied",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
  })
}

describe("task275 active tab info user goal closeout receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry user goal closeout receipt state", () => {
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
      yeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt: userGoalCloseoutReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept user goal closeout receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt: userGoalCloseoutReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
