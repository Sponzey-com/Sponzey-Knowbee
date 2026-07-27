export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTerminationInput = {
  readonly lastAcceptedBoundaryRef?: string
  readonly releaseReadinessNow?: boolean
  readonly enableSkillMappingNow?: boolean
  readonly addProductionBindingNow?: boolean
  readonly enableDefaultLiveSmokeNow?: boolean
}

export type YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination = {
  readonly schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1"
  readonly method: "browser.active_tab_info"
  readonly chainStatus: "closed_for_manual_architecture_review" | "blocked"
  readonly reasonCode:
    | "active_tab_info_release_evidence_chain_closed_for_manual_architecture_review"
    | "active_tab_info_release_evidence_chain_previous_boundary_incomplete"
    | "active_tab_info_release_evidence_chain_activation_not_allowed"
  readonly lastAcceptedBoundaryRef?: string
  readonly nextAllowedAction: "architecture_review" | "complete_previous_boundary"
  readonly addNewReceiptLedgerPairNow: false
  readonly releaseReadinessNow: false
  readonly enableSkillMappingNow: false
  readonly addProductionBindingNow: false
  readonly enableDefaultLiveSmokeNow: false
}

const ACCEPTED_CLOSURE_LEDGER_RECEIPT_SURFACE_MATRIX_REF =
  /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-surface-matrix:active-tab-info:accepted:[a-z0-9][a-z0-9:-]{0,96}$/u

export function evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination(
  input: YeonjangBrowserActiveTabInfoReleaseEvidenceChainTerminationInput,
): YeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination {
  const lastAcceptedBoundaryRef = input.lastAcceptedBoundaryRef?.trim()
  const hasAcceptedBoundary = Boolean(
    lastAcceptedBoundaryRef &&
      ACCEPTED_CLOSURE_LEDGER_RECEIPT_SURFACE_MATRIX_REF.test(lastAcceptedBoundaryRef),
  )

  if (!hasAcceptedBoundary) {
    return {
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
    }
  }

  const acceptedBoundaryRef = lastAcceptedBoundaryRef as string

  if (
    input.releaseReadinessNow ||
    input.enableSkillMappingNow ||
    input.addProductionBindingNow ||
    input.enableDefaultLiveSmokeNow
  ) {
    return {
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1",
      method: "browser.active_tab_info",
      chainStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_activation_not_allowed",
      lastAcceptedBoundaryRef: acceptedBoundaryRef,
      nextAllowedAction: "architecture_review",
      addNewReceiptLedgerPairNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    }
  }

  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-termination.v1",
    method: "browser.active_tab_info",
    chainStatus: "closed_for_manual_architecture_review",
    reasonCode: "active_tab_info_release_evidence_chain_closed_for_manual_architecture_review",
    lastAcceptedBoundaryRef: acceptedBoundaryRef,
    nextAllowedAction: "architecture_review",
    addNewReceiptLedgerPairNow: false,
    releaseReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  }
}
