import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode =
  | "receipt_ledger_chain_too_deep"
  | "release_surface_boundary_duplicate"
  | "manual_architecture_review_required"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalItem = {
  readonly cleanupCandidateRef: string
  readonly reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalInput = {
  readonly architectureReview: YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview
  readonly proposalReasonByCandidateRef: Readonly<Record<string, YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode>>
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1"
  readonly method: "browser.active_tab_info"
  readonly proposalStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_cleanup_proposal_ready"
    | "active_tab_info_release_evidence_chain_cleanup_proposal_review_not_ready"
    | "active_tab_info_release_evidence_chain_cleanup_proposal_reason_missing"
  readonly proposalItems: readonly YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalItem[]
  readonly manualApprovalRequired: true
  readonly deleteCodeNow: false
  readonly modifyPackageNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const PROPOSAL_REASON_CODES = new Set<YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalReasonCode>([
  "receipt_ledger_chain_too_deep",
  "release_surface_boundary_duplicate",
  "manual_architecture_review_required",
])

function blocked(
  reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal["reasonCode"],
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1",
    method: "browser.active_tab_info",
    proposalStatus: "blocked",
    reasonCode,
    proposalItems: [],
    manualApprovalRequired: true,
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal {
  if (input.architectureReview.reviewStatus !== "ready") {
    return blocked("active_tab_info_release_evidence_chain_cleanup_proposal_review_not_ready")
  }

  const proposalItems: YeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposalItem[] = []
  for (const cleanupCandidateRef of input.architectureReview.removeCandidateRefs) {
    const reasonCode = input.proposalReasonByCandidateRef[cleanupCandidateRef]
    if (!reasonCode || !PROPOSAL_REASON_CODES.has(reasonCode)) {
      return blocked("active_tab_info_release_evidence_chain_cleanup_proposal_reason_missing")
    }
    proposalItems.push({ cleanupCandidateRef, reasonCode })
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.v1",
    method: "browser.active_tab_info",
    proposalStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_cleanup_proposal_ready",
    proposalItems,
    manualApprovalRequired: true,
    deleteCodeNow: false,
    modifyPackageNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
