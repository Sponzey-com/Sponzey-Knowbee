import { type WebDocument, type WebSearchResult } from "./web-retrieval.js";
import type { ToolResult } from "../tools/types.js";
export interface WebSearchMetadataObservation {
    readonly kind: "search_metadata";
    readonly provider: "DuckDuckGo";
    readonly retrievedAt: string;
    readonly resultCount: number;
    readonly results: readonly WebSearchResult[];
}
export interface WebDocumentObservation {
    readonly kind: "document";
    readonly document: WebDocument;
}
export type WebToolResultObservation = WebSearchMetadataObservation | WebDocumentObservation;
export type WebToolResultObservationProjection = Readonly<{
    ok: true;
    value: WebToolResultObservation;
}> | Readonly<{
    ok: false;
    reasonCode: "web_tool_result_failed" | "web_tool_result_details_invalid" | "web_search_metadata_invalid" | "web_document_observation_invalid";
}>;
export declare function projectWebToolResultObservation(toolName: "web_search" | "web_fetch", result: ToolResult): WebToolResultObservationProjection;
//# sourceMappingURL=web-research-observation.d.ts.map