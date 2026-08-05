function compactText(value, maxLength) {
    if (typeof value !== "string")
        return null;
    const compact = value.trim().replace(/\s+/gu, " ");
    return compact.length > 0 && compact.length <= maxLength ? compact : null;
}
function publicUrl(value) {
    if (typeof value !== "string")
        return null;
    try {
        const parsed = new URL(value);
        if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
            parsed.username ||
            parsed.password ||
            !parsed.hostname) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function evidenceMatchesUrl(evidence, parsed) {
    const sourceUrl = publicUrl(evidence.sourceUrl);
    const sourceDomain = evidence.sourceDomain?.trim().toLowerCase();
    return (sourceUrl?.toString() === parsed.toString() &&
        sourceUrl.hostname.toLowerCase() === parsed.hostname.toLowerCase() &&
        sourceDomain === parsed.hostname.toLowerCase() &&
        Number.isFinite(Date.parse(evidence.fetchTimestamp)));
}
export function validateWebSearchQuery(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, reasonCode: "web_search_query_empty" };
    }
    const input = value;
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query)
        return { ok: false, reasonCode: "web_search_query_empty" };
    if (query.length > 512)
        return { ok: false, reasonCode: "web_search_query_too_long" };
    const locale = compactText(input.locale, 32);
    if (!locale)
        return { ok: false, reasonCode: "web_search_locale_invalid" };
    if (input.safeSearch !== "strict" && input.safeSearch !== "moderate") {
        return { ok: false, reasonCode: "web_search_safe_search_invalid" };
    }
    if (!Number.isInteger(input.maxResults) || (input.maxResults ?? 0) < 1 || (input.maxResults ?? 0) > 16) {
        return { ok: false, reasonCode: "web_search_result_limit_invalid" };
    }
    return {
        ok: true,
        value: {
            query,
            locale,
            safeSearch: input.safeSearch,
            maxResults: input.maxResults,
        },
    };
}
export function validateWebSearchResults(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, reasonCode: "web_search_results_empty" };
    }
    if (value.length > 16)
        return { ok: false, reasonCode: "web_search_result_count_invalid" };
    const urls = new Set();
    const refs = new Set();
    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        const parsed = publicUrl(item.url);
        if (!parsed)
            return { ok: false, reasonCode: "web_evidence_url_invalid" };
        if (!compactText(item.evidenceRef, 256) ||
            !compactText(item.title, 512) ||
            !compactText(item.domain, 256) ||
            typeof item.snippet !== "string" ||
            item.snippet.length > 2_048 ||
            item.rank !== index + 1) {
            return { ok: false, reasonCode: "web_search_result_invalid" };
        }
        const canonicalUrl = parsed.toString();
        if (urls.has(canonicalUrl)) {
            return { ok: false, reasonCode: "web_search_result_url_duplicate" };
        }
        if (refs.has(item.evidenceRef)) {
            return { ok: false, reasonCode: "web_search_result_invalid" };
        }
        if (!item.sourceEvidence) {
            return { ok: false, reasonCode: "web_evidence_provenance_missing" };
        }
        if (item.domain?.toLowerCase() !== parsed.hostname.toLowerCase() ||
            !evidenceMatchesUrl(item.sourceEvidence, parsed)) {
            return { ok: false, reasonCode: "web_evidence_provenance_mismatch" };
        }
        urls.add(canonicalUrl);
        refs.add(item.evidenceRef);
    }
    return { ok: true, value: value };
}
export function validateWebDocument(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, reasonCode: "web_document_invalid" };
    }
    const document = value;
    const parsed = publicUrl(document.url);
    if (!parsed)
        return { ok: false, reasonCode: "web_evidence_url_invalid" };
    if (!compactText(document.evidenceRef, 256) ||
        !compactText(document.title, 512) ||
        typeof document.markdown !== "string" ||
        !document.markdown.trim() ||
        document.markdown.length > 200_000 ||
        typeof document.truncated !== "boolean") {
        return { ok: false, reasonCode: "web_document_invalid" };
    }
    if (!document.sourceEvidence) {
        return { ok: false, reasonCode: "web_evidence_provenance_missing" };
    }
    if (!evidenceMatchesUrl(document.sourceEvidence, parsed)) {
        return { ok: false, reasonCode: "web_evidence_provenance_mismatch" };
    }
    return { ok: true, value: document };
}
export function projectWebSearchMarkdown(input) {
    const query = compactText(input.query, 512) ?? "";
    const results = [...input.results].sort((left, right) => left.rank - right.rank);
    const lines = [
        "<!-- untrusted-web-evidence -->",
        "# Web Search Results",
        "",
        `- Query: ${query}`,
        `- Provider: ${input.provider}`,
        `- Retrieved at: ${input.retrievedAt}`,
        `- Result count: ${results.length}`,
    ];
    for (const item of results) {
        lines.push("", `## ${item.rank}. ${compactText(item.title, 512) ?? "Untitled"}`, "", `- URL: ${item.url}`, `- Domain: ${item.domain}`, `- Snippet: ${compactText(item.snippet, 2_048) ?? ""}`);
    }
    return `${lines.join("\n")}\n`;
}
export function projectWebDocumentMarkdown(document) {
    const evidence = document.sourceEvidence;
    return [
        "<!-- untrusted-web-evidence -->",
        `# ${compactText(document.title, 512) ?? "Untitled"}`,
        "",
        document.markdown.trim(),
        "",
        "---",
        "",
        `- Source: ${document.url}`,
        `- Source timestamp: ${evidence.sourceTimestamp ?? "unknown"}`,
        `- Retrieved at: ${evidence.fetchTimestamp}`,
        `- Freshness: ${evidence.freshnessVerdict ?? "unknown"}`,
        `- Truncated: ${String(document.truncated)}`,
        "",
    ].join("\n");
}
//# sourceMappingURL=web-retrieval.js.map