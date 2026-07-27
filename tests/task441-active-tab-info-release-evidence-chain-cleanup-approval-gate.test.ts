import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.ts"
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
const OPERATOR_APPROVAL_REF =
  "cleanup-approval:active-tab-info:operator-approved:manual-review-001"

function readyCleanupProposal() {
  const architectureReview = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
    termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
    }),
    cleanupCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
    architectureReview,
    proposalReasonByCandidateRef: {
      [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
      [SURFACE_BOUNDARY_CANDIDATE_REF]: "release_surface_boundary_duplicate",
    },
  })
}

describe("task441 active tab info release evidence chain cleanup approval gate", () => {
  it("blocks cleanup when proposal is ready but operator approval is missing", () => {
    expect(evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
      cleanupProposal: readyCleanupProposal(),
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.v1",
      method: "browser.active_tab_info",
      approvalStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_approval_ref_missing",
      approvedCandidateCount: 0,
      nextAllowedAction: "obtain_manual_approval",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("allows only a safe explicit approval covering every proposed cleanup candidate", () => {
    expect(evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
      cleanupProposal: readyCleanupProposal(),
      operatorApprovalRef: OPERATOR_APPROVAL_REF,
      approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.v1",
      method: "browser.active_tab_info",
      approvalStatus: "ready_for_tidy_first_cleanup",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_approval_ready_for_tidy_first_cleanup",
      operatorApprovalRef: OPERATOR_APPROVAL_REF,
      approvedCandidateCount: 2,
      nextAllowedAction: "create_tidy_first_cleanup_task",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("rejects unsafe approval refs or incomplete candidate approval without performing deletion", () => {
    const unsafeApproval = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
      cleanupProposal: readyCleanupProposal(),
      operatorApprovalRef: "/Users/private/approval.json",
      approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
    })
    const incomplete = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
      cleanupProposal: readyCleanupProposal(),
      operatorApprovalRef: OPERATOR_APPROVAL_REF,
      approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF],
    })

    expect(unsafeApproval).toMatchObject({
      approvalStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_approval_ref_invalid",
      approvedCandidateCount: 0,
      nextAllowedAction: "obtain_manual_approval",
      deleteCodeNow: false,
      modifyPackageNow: false,
    })
    expect(incomplete).toMatchObject({
      approvalStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_approval_candidates_incomplete",
      approvedCandidateCount: 0,
      nextAllowedAction: "obtain_manual_approval",
      deleteCodeNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
    })
    expect(JSON.stringify({ unsafeApproval, incomplete })).not.toMatch(
      /\.ts|\.js|Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })
})
