import { type ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { SourceFreshnessAssessment, SourceFreshnessPolicy, SourceKind, SourceReliability, WebRetrievalMethod, WebRetrievalTransitionAdmission, WebRetrievalTransitionReceipt } from "../contracts/web-retrieval.js";
export declare const WEB_RETRIEVAL_POLICY_VERSION = "web-provenance-v2";
export declare const SOURCE_FRESHNESS_POLICY_VERSION = "strict-source-age-v1";
export declare const STRICT_SOURCE_MAX_AGE_MS: number;
export type { SourceEvidence, SourceFreshnessAssessment, SourceFreshnessPolicy, SourceFreshnessReasonCode, SourceFreshnessVerdict, SourceKind, SourceReliability, WebRetrievalMethod, WebRetrievalTransitionAdmission, WebRetrievalTransitionReceipt, } from "../contracts/web-retrieval.js";
export interface WebRetrievalPolicyInput {
    toolName: string;
    params: Record<string, unknown>;
    userMessage?: string;
    now?: Date;
    locale?: string;
}
export interface WebRetrievalPolicyDecision {
    applies: boolean;
    method: WebRetrievalMethod;
    dedupeKey: string;
    canonicalParams: Record<string, unknown>;
    freshnessPolicy: SourceFreshnessPolicy;
    sourceKind: SourceKind;
    reliability: SourceReliability;
    fetchTimestamp: string;
}
export interface BrowserSearchEvidenceInput {
    artifactStorage: ArtifactStorageContext;
    query: string;
    url?: string | null;
    extractedText?: string | null;
    screenshotBase64?: string | null;
    timeoutReason?: string | null;
    error?: unknown;
    runId?: string | null;
    requestGroupId?: string | null;
    method?: WebRetrievalMethod;
    createdAt?: number;
}
export interface BrowserSearchEvidenceArtifact {
    artifactPath: string;
    artifactId: string | null;
    diagnosticEventId: string | null;
    userMessage: string;
}
export declare function normalizeSourceTimestamp(sourceTimestamp: string | null | undefined, fetchTimestamp: string): string | null;
export declare function assessSourceFreshness(input: {
    sourceTimestamp: string | null | undefined;
    fetchTimestamp: string;
    freshnessPolicy: SourceFreshnessPolicy;
}): SourceFreshnessAssessment;
export declare function buildWebRetrievalTransitionReceipt(input: {
    toolName: string;
    result: {
        success: boolean;
        details?: unknown;
    };
    policy: WebRetrievalPolicyDecision;
}): WebRetrievalTransitionReceipt | null;
export declare function evaluateWebRetrievalTransitionAdmission(input: {
    nextToolName: string;
    receipts: WebRetrievalTransitionReceipt[];
}): WebRetrievalTransitionAdmission;
export declare function buildWebRetrievalPolicyDecision(input: WebRetrievalPolicyInput): WebRetrievalPolicyDecision | null;
export declare function extractSourceTimestampFromHtml(html: string): string | null;
export declare function recordBrowserSearchEvidence(input: BrowserSearchEvidenceInput): BrowserSearchEvidenceArtifact;
//# sourceMappingURL=web-retrieval-policy.d.ts.map