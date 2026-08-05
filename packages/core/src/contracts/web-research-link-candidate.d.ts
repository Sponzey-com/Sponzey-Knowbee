import type { WebResearchFetchCandidateDiscovery, WebResearchFingerprintPort, WebResearchMethodCandidate } from "./web-research-method.js";
export interface WebResearchLinkObservation {
    readonly ordinal: number;
    readonly url: string;
}
export type WebResearchLinkTargetAdmission = Readonly<{
    observedUrl: string;
    status: "allowed";
    canonicalUrl: string;
}> | Readonly<{
    observedUrl: string;
    status: "denied";
    reasonCode: string;
}>;
export interface WebResearchLinkCandidateExclusion {
    readonly ordinal: number;
    readonly reasonCode: string;
}
export type WebResearchLinkCandidate = Extract<WebResearchMethodCandidate, {
    kind: "fetch";
}> & {
    readonly discovery: WebResearchFetchCandidateDiscovery;
};
export interface WebResearchLinkCandidateProjection {
    readonly candidates: readonly WebResearchLinkCandidate[];
    readonly exclusions: readonly WebResearchLinkCandidateExclusion[];
}
export declare function projectWebResearchLinkCandidates(input: {
    runId: string;
    parentEvidenceRef: string;
    parentProvenanceRef: string;
    documentFinalUrl: string;
    observations: readonly WebResearchLinkObservation[];
    targetAdmissions: readonly WebResearchLinkTargetAdmission[];
    maxCandidates: number;
}, createFingerprint: WebResearchFingerprintPort): WebResearchLinkCandidateProjection;
//# sourceMappingURL=web-research-link-candidate.d.ts.map