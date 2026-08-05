export type WebRetrievalMethod = "official_api" | "direct_fetch" | "fast_text_search" | "browser_search";
export type SourceKind = "official" | "first_party" | "search_index" | "third_party" | "browser_evidence" | "unknown";
export type SourceReliability = "high" | "medium" | "low" | "unknown";
export type SourceFreshnessPolicy = "normal" | "latest_approximate" | "strict_timestamp";
export type SourceFreshnessVerdict = "fresh" | "stale" | "unknown";
export type SourceFreshnessReasonCode = "strict_source_age_within_limit" | "strict_source_age_exceeded" | "strict_source_timestamp_missing" | "strict_source_timestamp_invalid" | "strict_source_timestamp_future" | "freshness_not_strict";
export interface SourceFreshnessAssessment {
    policyVersion: "strict-source-age-v1";
    freshnessVerdict: SourceFreshnessVerdict;
    freshnessReasonCode: SourceFreshnessReasonCode;
    normalizedSourceTimestamp: string | null;
    sourceAgeMs: number | null;
}
export interface SourceEvidence {
    method: WebRetrievalMethod;
    sourceKind: SourceKind;
    reliability: SourceReliability;
    sourceUrl?: string | null;
    sourceDomain?: string | null;
    sourceLabel?: string | null;
    sourceTimestamp?: string | null;
    fetchTimestamp: string;
    freshnessPolicy?: SourceFreshnessPolicy;
    policyVersion?: "strict-source-age-v1";
    freshnessVerdict?: SourceFreshnessVerdict;
    freshnessReasonCode?: SourceFreshnessReasonCode;
    normalizedSourceTimestamp?: string | null;
    sourceAgeMs?: number | null;
    adapterId?: string | null;
    adapterVersion?: string | null;
    parserVersion?: string | null;
    adapterStatus?: "active" | "degraded" | null;
}
export interface WebRetrievalTransitionReceipt {
    schemaVersion: 1;
    kind: "discovery" | "direct_fetch_attempt";
    candidateRefs: string[];
}
export type WebRetrievalTransitionAdmission = {
    allowed: true;
    pendingCandidateCount: number;
} | {
    allowed: false;
    reasonCode: "web_direct_fetch_required";
    pendingCandidateCount: number;
};
export interface WebSearchQuery {
    query: string;
    locale: string;
    safeSearch: "strict" | "moderate";
    maxResults: number;
}
export interface WebRetrievalCandidate {
    readonly evidenceRef: string;
    readonly sourceUrl: string;
    readonly sourceDomain: string;
    readonly sourceTimestamp: string | null;
    readonly fetchedAt: string;
}
export interface WebSearchResult {
    evidenceRef: string;
    rank: number;
    title: string;
    url: string;
    domain: string;
    snippet: string;
    sourceEvidence: SourceEvidence;
}
export interface WebDocument {
    evidenceRef: string;
    title: string;
    url: string;
    markdown: string;
    truncated: boolean;
    sourceEvidence: SourceEvidence;
}
export type WebRetrievalValidationReason = "web_search_query_empty" | "web_search_query_too_long" | "web_search_locale_invalid" | "web_search_safe_search_invalid" | "web_search_result_limit_invalid" | "web_search_results_empty" | "web_search_result_count_invalid" | "web_search_result_invalid" | "web_search_result_url_duplicate" | "web_document_invalid" | "web_evidence_url_invalid" | "web_evidence_provenance_missing" | "web_evidence_provenance_mismatch";
export type WebRetrievalValidation<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    reasonCode: WebRetrievalValidationReason;
};
export declare function validateWebSearchQuery(value: unknown): WebRetrievalValidation<WebSearchQuery>;
export declare function validateWebSearchResults(value: unknown): WebRetrievalValidation<readonly WebSearchResult[]>;
export declare function validateWebDocument(value: unknown): WebRetrievalValidation<WebDocument>;
export declare function projectWebSearchMarkdown(input: {
    query: string;
    provider: "DuckDuckGo";
    retrievedAt: string;
    results: readonly WebSearchResult[];
}): string;
export declare function projectWebDocumentMarkdown(document: WebDocument): string;
//# sourceMappingURL=web-retrieval.d.ts.map