import { describe, expect, it } from "vitest"

import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts"

const ACCEPTED_BOUNDARY_REF =
  "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-surface-matrix:active-tab-info:accepted:001"

describe("task438 active tab info release evidence chain termination", () => {
  it("closes the evidence chain for manual architecture review after the closure ledger receipt surface matrix", () => {
    expect(evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1",
      method: "browser.active_tab_info",
      chainStatus: "closed_for_manual_architecture_review",
      reasonCode: "active_tab_info_release_evidence_chain_closed_for_manual_architecture_review",
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
      nextAllowedAction: "architecture_review",
      addNewReceiptLedgerPairNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks termination until the previous accepted boundary is complete", () => {
    expect(evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef:
        "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt:active-tab-info:sanitized:001",
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1",
      method: "browser.active_tab_info",
      chainStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_previous_boundary_incomplete",
      nextAllowedAction: "complete_previous_boundary",
      addNewReceiptLedgerPairNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("does not turn chain closure into release readiness or downstream activation", () => {
    const result = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
      releaseReadinessNow: true,
      enableSkillMappingNow: true,
      addProductionBindingNow: true,
      enableDefaultLiveSmokeNow: true,
    })

    expect(result).toMatchObject({
      chainStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_activation_not_allowed",
      nextAllowedAction: "architecture_review",
      addNewReceiptLedgerPairNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })
})
