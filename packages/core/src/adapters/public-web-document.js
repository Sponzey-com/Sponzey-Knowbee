import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { projectWebDocumentMarkdown, validateWebDocument, } from "../contracts/web-retrieval.js";
import { defaultNetworkAddressResolver, fetchPublicHttp, NetworkTargetPolicyError, } from "./public-http-fetch.js";
import { assessSourceFreshness, extractSourceTimestampFromHtml, } from "../runs/web-retrieval-policy.js";
const TRACKING_QUERY_KEYS = new Set([
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
]);
const MAX_LINK_OBSERVATIONS = 64;
function canonicalObservedLink(rawHref, baseUrl) {
    try {
        const url = new URL(rawHref, baseUrl);
        if ((url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password) {
            return null;
        }
        const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
        if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
            return null;
        }
        url.hash = "";
        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_QUERY_KEYS.has(key.toLowerCase()))
                url.searchParams.delete(key);
        }
        url.searchParams.sort();
        return url.toString();
    }
    catch {
        return null;
    }
}
function htmlToMarkdown(html, url) {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    document.querySelectorAll([
        "script",
        "style",
        "noscript",
        "template",
        "svg",
        "form",
        "nav",
        "menu",
        "footer",
        "aside",
        '[role="navigation"]',
        '[role="banner"]',
        '[role="contentinfo"]',
        '[role="complementary"]',
        ".ad",
        ".ads",
        ".advertisement",
        ".advertising",
        "[data-ad]",
        ".comments",
        "#comments",
        ".comment-list",
        "[data-comments]",
        "[hidden]",
        '[aria-hidden="true"]',
    ].join(", "))
        .forEach((node) => node.remove());
    document.querySelectorAll("a[href]").forEach((node) => {
        const href = node.getAttribute("href");
        if (!href)
            return;
        const canonicalUrl = canonicalObservedLink(href, url);
        if (!canonicalUrl) {
            node.removeAttribute("href");
            return;
        }
        node.setAttribute("href", canonicalUrl);
    });
    const main = document.querySelector("main");
    const reader = main ? null : new Readability(document).parse();
    const title = (main?.querySelector("h1")?.textContent ?? reader?.title ?? document.title ?? "Page")
        .trim() || "Page";
    const content = main?.innerHTML ?? reader?.content ?? document.body?.innerHTML ?? "";
    const contentDom = new JSDOM(`<body>${content}</body>`, { url });
    const observedUrls = [];
    const seenUrls = new Set();
    contentDom.window.document.querySelectorAll("a[href]").forEach((node) => {
        const href = node.getAttribute("href");
        if (!href)
            return;
        const canonicalUrl = canonicalObservedLink(href, url);
        if (canonicalUrl &&
            observedUrls.length < MAX_LINK_OBSERVATIONS &&
            !seenUrls.has(canonicalUrl)) {
            seenUrls.add(canonicalUrl);
            observedUrls.push(canonicalUrl);
        }
    });
    const markdown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
    }).turndown(content).trim();
    return {
        title,
        markdown,
        linkObservations: Object.freeze(observedUrls.map((observedUrl, index) => Object.freeze({ ordinal: index + 1, url: observedUrl }))),
    };
}
export function createPublicWebDocumentAdapter(dependencies = {}) {
    const resolver = dependencies.resolver ?? defaultNetworkAddressResolver;
    const fetcher = dependencies.fetcher ?? globalThis.fetch;
    const now = dependencies.now ?? (() => new Date());
    const maxRedirects = dependencies.maxRedirects ?? 5;
    return async (input) => {
        if (input.signal.aborted) {
            return { ok: false, reasonCode: "web_document_cancelled", retryable: false };
        }
        try {
            const { response, effectiveUrl } = await fetchPublicHttp({
                rawUrl: input.url,
                resolver,
                fetcher,
                maxRedirects,
                signal: input.signal,
            });
            if (!response.ok) {
                return { ok: false, reasonCode: "web_document_provider_rejected", retryable: response.status >= 500 };
            }
            const declaredLength = Number(response.headers.get("content-length"));
            if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
                return { ok: false, reasonCode: "web_document_response_too_large", retryable: false };
            }
            const body = await response.text();
            if (new TextEncoder().encode(body).byteLength > input.maxBytes) {
                return { ok: false, reasonCode: "web_document_response_too_large", retryable: false };
            }
            const contentType = (response.headers.get("content-type") ?? "text/html").toLowerCase();
            let title;
            let markdown;
            let linkObservations = Object.freeze([]);
            let sourceTimestamp = null;
            if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
                const projected = htmlToMarkdown(body, effectiveUrl);
                title = projected.title;
                markdown = projected.markdown;
                linkObservations = projected.linkObservations;
                sourceTimestamp = extractSourceTimestampFromHtml(body);
            }
            else if (contentType.includes("text/plain")) {
                title = new URL(effectiveUrl).hostname;
                markdown = body.trim();
            }
            else {
                return { ok: false, reasonCode: "web_document_content_unsupported", retryable: false };
            }
            if (!markdown)
                return { ok: false, reasonCode: "web_document_empty", retryable: false };
            const truncated = markdown.length > input.maxMarkdownCharacters;
            if (truncated)
                markdown = markdown.slice(0, input.maxMarkdownCharacters);
            const fetchTimestamp = now().toISOString();
            const freshness = assessSourceFreshness({
                sourceTimestamp,
                fetchTimestamp,
                freshnessPolicy: input.freshnessPolicy,
            });
            const document = {
                evidenceRef: `web-document:${effectiveUrl}`,
                title,
                url: effectiveUrl,
                markdown,
                truncated,
                sourceEvidence: {
                    method: "direct_fetch",
                    sourceKind: "third_party",
                    reliability: "medium",
                    sourceUrl: effectiveUrl,
                    sourceDomain: new URL(effectiveUrl).hostname.toLowerCase(),
                    sourceTimestamp,
                    fetchTimestamp,
                    freshnessPolicy: input.freshnessPolicy,
                    ...freshness,
                    adapterId: "public-web-document",
                    adapterVersion: "1",
                    parserVersion: "readability-turndown-v1",
                    adapterStatus: "active",
                },
            };
            const validated = validateWebDocument(document);
            if (!validated.ok) {
                return { ok: false, reasonCode: "web_document_evidence_invalid", retryable: false };
            }
            return {
                ok: true,
                document: validated.value,
                markdown: projectWebDocumentMarkdown(validated.value),
                navigation: Object.freeze({
                    requestedUrl: new URL(input.url).toString(),
                    finalUrl: effectiveUrl,
                }),
                linkObservations,
            };
        }
        catch (error) {
            if (input.signal.aborted) {
                return { ok: false, reasonCode: "web_document_cancelled", retryable: false };
            }
            if (error instanceof NetworkTargetPolicyError) {
                return {
                    ok: false,
                    reasonCode: "web_document_target_rejected",
                    retryable: false,
                    rejectionCode: error.code,
                };
            }
            return { ok: false, reasonCode: "web_document_network_failed", retryable: true };
        }
    };
}
//# sourceMappingURL=public-web-document.js.map