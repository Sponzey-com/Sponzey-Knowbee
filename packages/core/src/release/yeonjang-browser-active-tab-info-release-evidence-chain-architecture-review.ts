import type {
  YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination,
} from "./yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts"

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReviewInput = {
  readonly termination: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination
  readonly cleanupCandidateRefs: readonly string[]
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.v1"
  readonly method: "browser.active_tab_info"
  readonly reviewStatus: "ready" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_architecture_review_ready"
    | "active_tab_info_release_evidence_chain_architecture_review_termination_not_closed"
    | "active_tab_info_release_evidence_chain_architecture_review_candidate_ref_invalid"
  readonly cleanupCandidateCount: number
  readonly keepBoundaryRefs: readonly string[]
  readonly removeCandidateRefs: readonly string[]
  readonly manualDecisionRequired: true
  readonly deleteCodeNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
}

const CLEANUP_CANDIDATE_REF =
  /^(receipt-ledger-chain|release-surface-boundary):active-tab-info:cleanup-candidate:[a-z0-9][a-z0-9:-]{0,96}$/u

function commonBlocked(
  reasonCode: YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview["reasonCode"],
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.v1",
    method: "browser.active_tab_info",
    reviewStatus: "blocked",
    reasonCode,
    cleanupCandidateCount: 0,
    keepBoundaryRefs: [],
    removeCandidateRefs: [],
    manualDecisionRequired: true,
    deleteCodeNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}

export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReviewInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview {
  if (
    input.termination.chainStatus !== "closed_for_manual_architecture_review" ||
    !input.termination.lastAcceptedBoundaryRef
  ) {
    return commonBlocked(
      "active_tab_info_release_evidence_chain_architecture_review_termination_not_closed",
    )
  }

  const removeCandidateRefs = input.cleanupCandidateRefs.map((item) => item.trim())
  if (removeCandidateRefs.some((item) => !CLEANUP_CANDIDATE_REF.test(item))) {
    return commonBlocked(
      "active_tab_info_release_evidence_chain_architecture_review_candidate_ref_invalid",
    )
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.v1",
    method: "browser.active_tab_info",
    reviewStatus: "ready",
    reasonCode: "active_tab_info_release_evidence_chain_architecture_review_ready",
    cleanupCandidateCount: removeCandidateRefs.length,
    keepBoundaryRefs: [input.termination.lastAcceptedBoundaryRef],
    removeCandidateRefs,
    manualDecisionRequired: true,
    deleteCodeNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
  }
}
