import type { WebResearchLinkCandidate } from "./web-research-link-candidate.js"

export type WebDiscoveryExecutionState =
  | { status: "not_attempted" }
  | { status: "attempted" }

export type WebValidatedEvidenceState =
  | { status: "none" }
  | { status: "available" }

export interface WebExecutionState {
  discovery: WebDiscoveryExecutionState
  validatedEvidence: WebValidatedEvidenceState
  observedFetchCandidates: WebResearchLinkCandidate[]
  observedSearchResults: Array<{
    sourceUrl: string
    evidenceRef: string
  }>
  attemptedFetchUrls?: string[]
}
