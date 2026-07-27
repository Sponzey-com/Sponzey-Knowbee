import { validateWebDocument, validateWebSearchResults, } from "./web-retrieval.js";
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function isoTimestamp(value) {
    if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
        return null;
    }
    return new Date(value).toISOString();
}
function frozenSearchResult(result) {
    return Object.freeze({
        ...result,
        sourceEvidence: Object.freeze({ ...result.sourceEvidence }),
    });
}
function frozenDocument(document) {
    return Object.freeze({
        ...document,
        sourceEvidence: Object.freeze({ ...document.sourceEvidence }),
    });
}
export function projectWebToolResultObservation(toolName, result) {
    if (!result.success) {
        return Object.freeze({ ok: false, reasonCode: "web_tool_result_failed" });
    }
    const details = record(result.details);
    if (!details) {
        return Object.freeze({ ok: false, reasonCode: "web_tool_result_details_invalid" });
    }
    if (toolName === "web_search") {
        const retrievedAt = isoTimestamp(details.retrievedAt);
        const validated = validateWebSearchResults(details.results);
        if (details.provider !== "DuckDuckGo" || !retrievedAt || !validated.ok) {
            return Object.freeze({ ok: false, reasonCode: "web_search_metadata_invalid" });
        }
        const results = Object.freeze(validated.value.map(frozenSearchResult));
        return Object.freeze({
            ok: true,
            value: Object.freeze({
                kind: "search_metadata",
                provider: "DuckDuckGo",
                retrievedAt,
                resultCount: results.length,
                results,
            }),
        });
    }
    const validated = validateWebDocument(details.document);
    if (!validated.ok ||
        /<!doctype\s+html|<html\b|<script\b/iu.test(validated.value.markdown)) {
        return Object.freeze({ ok: false, reasonCode: "web_document_observation_invalid" });
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            kind: "document",
            document: frozenDocument(validated.value),
        }),
    });
}
//# sourceMappingURL=web-research-observation.js.map