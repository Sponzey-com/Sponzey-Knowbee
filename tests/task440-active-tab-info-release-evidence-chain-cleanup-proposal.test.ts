import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts"

const ACCEPTED_BOUNDARY_REF =
  "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-surface-matrix:active-tab-info:accepted:001"
const RECEIPT_CHAIN_CANDIDATE_REF =
  "receipt-ledger-chain:active-tab-info:cleanup-candidate:operator-final-retained-chain"
const SURFACE_BOUNDARY_CANDIDATE_REF =
  "release-surface-boundary:active-tab-info:cleanup-candidate:legacy-ledger-boundary"

function readyArchitectureReview() {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
    termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
    }),
    cleanupCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
}

describe("task440 active tab info release evidence chain cleanup proposal", () => {
  it("builds a redacted cleanup proposal from a ready architecture review", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
      architectureReview: readyArchitectureReview(),
      proposalReasonByCandidateRef: {
        [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
        [SURFACE_BOUNDARY_CANDIDATE_REF]: "release_surface_boundary_duplicate",
      },
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1",
      method: "browser.active_tab_info",
      proposalStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_ready",
      proposalItems: [
        {
          cleanupCandidateRef: RECEIPT_CHAIN_CANDIDATE_REF,
          reasonCode: "receipt_ledger_chain_too_deep",
        },
        {
          cleanupCandidateRef: SURFACE_BOUNDARY_CANDIDATE_REF,
          reasonCode: "release_surface_boundary_duplicate",
        },
      ],
      manualApprovalRequired: true,
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks proposal generation when architecture review is not ready", () => {
    const blockedReview = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
      termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
        lastAcceptedBoundaryRef: "",
      }),
      cleanupCandidateRefs: [],
    })

    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
      architectureReview: blockedReview,
      proposalReasonByCandidateRef: {},
    })).toMatchObject({
      proposalStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_review_not_ready",
      proposalItems: [],
      manualApprovalRequired: true,
      deleteCodeNow: false,
      modifyPackageNow: false,
    })
  })

  it("requires explicit safe reason codes and does not expose raw deletion paths", () => {
    const missingReason = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
      architectureReview: readyArchitectureReview(),
      proposalReasonByCandidateRef: {
        [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
      },
    })
    const ready = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
      architectureReview: readyArchitectureReview(),
      proposalReasonByCandidateRef: {
        [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
        [SURFACE_BOUNDARY_CANDIDATE_REF]: "manual_architecture_review_required",
      },
    })

    expect(missingReason).toMatchObject({
      proposalStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_reason_missing",
      proposalItems: [],
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
    })
    expect(ready).toMatchObject({
      proposalStatus: "ready",
      manualApprovalRequired: true,
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(ready)).not.toMatch(
      /\.ts|\.js|Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })
})
