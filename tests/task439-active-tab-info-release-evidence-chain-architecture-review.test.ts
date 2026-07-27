import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts"

const ACCEPTED_BOUNDARY_REF =
  "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-surface-matrix:active-tab-info:accepted:001"

function closedTermination() {
  return evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
    lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
  })
}

describe("task439 active tab info release evidence chain architecture review", () => {
  it("builds a manual architecture review summary from a closed evidence chain", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
      termination: closedTermination(),
      cleanupCandidateRefs: [
        "receipt-ledger-chain:active-tab-info:cleanup-candidate:operator-final-retained-chain",
        "release-surface-boundary:active-tab-info:cleanup-candidate:legacy-ledger-boundary",
      ],
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.v1",
      method: "browser.active_tab_info",
      reviewStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_architecture_review_ready",
      cleanupCandidateCount: 2,
      keepBoundaryRefs: [ACCEPTED_BOUNDARY_REF],
      removeCandidateRefs: [
        "receipt-ledger-chain:active-tab-info:cleanup-candidate:operator-final-retained-chain",
        "release-surface-boundary:active-tab-info:cleanup-candidate:legacy-ledger-boundary",
      ],
      manualDecisionRequired: true,
      deleteCodeNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks review when termination has not closed the chain", () => {
    const termination = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: "",
    })

    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
      termination,
      cleanupCandidateRefs: [],
    })).toMatchObject({
      reviewStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_architecture_review_termination_not_closed",
      cleanupCandidateCount: 0,
      manualDecisionRequired: true,
      deleteCodeNow: false,
    })
  })

  it("rejects unsafe cleanup candidate refs and never performs deletion or activation", () => {
    const result = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
      termination: closedTermination(),
      cleanupCandidateRefs: ["/Users/private/raw-contract.ts"],
    })

    expect(result).toMatchObject({
      reviewStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_architecture_review_candidate_ref_invalid",
      cleanupCandidateCount: 0,
      deleteCodeNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })
})
