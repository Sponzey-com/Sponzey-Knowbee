import { type LiveAcceptanceCapability, type LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
import type { LiveAcceptanceBundleApproval, LiveAcceptanceBundleCandidate, LiveAcceptanceBundlePayload } from "./live-acceptance-bundle.js";
export interface LiveAcceptanceProducerResult {
    accepted: readonly LiveAcceptanceEvidence[];
    rejected: readonly {
        scenarioId: string;
        capability?: LiveAcceptanceCapability;
        reasonCode: string;
    }[];
}
export interface CandidateBoundLiveAcceptanceProducerResult {
    candidate: LiveAcceptanceBundleCandidate;
    result: LiveAcceptanceProducerResult;
}
export interface LiveAcceptanceCollectionInput {
    candidate: LiveAcceptanceBundleCandidate;
    approval: LiveAcceptanceBundleApproval;
    channels: CandidateBoundLiveAcceptanceProducerResult;
    web: CandidateBoundLiveAcceptanceProducerResult;
    extensions: CandidateBoundLiveAcceptanceProducerResult;
    yeonjang: CandidateBoundLiveAcceptanceProducerResult;
    now: number;
    maxEvidenceAgeMs: number;
}
export interface LiveAcceptanceCollectionBlocker {
    capability: LiveAcceptanceEvidence["capability"] | "collection";
    reasonCode: string;
    sourceReasonCode?: string;
}
export type LiveAcceptanceCollectionResult = {
    status: "collected";
    payload: Readonly<LiveAcceptanceBundlePayload>;
} | {
    status: "blocked";
    blockers: readonly LiveAcceptanceCollectionBlocker[];
};
export declare function collectLiveAcceptancePayload(input: LiveAcceptanceCollectionInput): LiveAcceptanceCollectionResult;
//# sourceMappingURL=live-acceptance-collector.d.ts.map