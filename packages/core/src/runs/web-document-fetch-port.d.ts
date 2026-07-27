import type { SourceFreshnessPolicy, WebDocument } from "../contracts/web-retrieval.js";
export interface WebDocumentFetchInput {
    url: string;
    maxBytes: number;
    maxMarkdownCharacters: number;
    freshnessPolicy: SourceFreshnessPolicy;
    signal: AbortSignal;
}
export interface WebDocumentNavigation {
    readonly requestedUrl: string;
    readonly finalUrl: string;
}
export interface WebDocumentLinkObservation {
    readonly ordinal: number;
    readonly url: string;
}
export type WebDocumentFetchFailureReason = "web_document_cancelled" | "web_document_timeout" | "web_document_target_rejected" | "web_document_network_failed" | "web_document_provider_rejected" | "web_document_content_unsupported" | "web_document_response_too_large" | "web_document_empty" | "web_document_evidence_invalid";
export type WebDocumentFetchOutcome = {
    ok: true;
    document: WebDocument;
    markdown: string;
    navigation: WebDocumentNavigation;
    linkObservations: readonly WebDocumentLinkObservation[];
} | {
    ok: false;
    reasonCode: WebDocumentFetchFailureReason;
    retryable: boolean;
    rejectionCode?: string;
};
export type WebDocumentFetchPort = (input: WebDocumentFetchInput) => Promise<WebDocumentFetchOutcome>;
//# sourceMappingURL=web-document-fetch-port.d.ts.map