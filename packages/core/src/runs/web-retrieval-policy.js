import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { insertDiagnosticEvent } from "../db/index.js";
import { recordArtifactMetadata, } from "../artifacts/lifecycle.js";
import { redactLogText } from "../logger/index.js";
import { sanitizeUserFacingError } from "./error-sanitizer.js";
export const WEB_RETRIEVAL_POLICY_VERSION = "web-provenance-v2";
export const SOURCE_FRESHNESS_POLICY_VERSION = "strict-source-age-v1";
export const STRICT_SOURCE_MAX_AGE_MS = 96 * 60 * 60 * 1_000;
const SOURCE_TIMESTAMP_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const TRACKING_QUERY_KEYS = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
]);
const ENGLISH_MONTH_INDEX = new Map([
    ["jan", 0], ["january", 0], ["feb", 1], ["february", 1],
    ["mar", 2], ["march", 2], ["apr", 3], ["april", 3], ["may", 4],
    ["jun", 5], ["june", 5], ["jul", 6], ["july", 6], ["aug", 7],
    ["august", 7], ["sep", 8], ["september", 8], ["oct", 9], ["october", 9],
    ["nov", 10], ["november", 10], ["dec", 11], ["december", 11],
]);
function offsetMinutes(sign, hourText, minuteText) {
    const absolute = Number.parseInt(hourText, 10) * 60 + Number.parseInt(minuteText ?? "0", 10);
    return sign === "-" ? -absolute : absolute;
}
function timestampFromParts(input) {
    return Date.UTC(input.year, input.monthIndex, input.day, input.hour, input.minute, input.second) - input.offsetMinutes * 60_000;
}
export function normalizeSourceTimestamp(sourceTimestamp, fetchTimestamp) {
    const source = sourceTimestamp?.trim();
    const fetchMs = Date.parse(fetchTimestamp);
    if (!source || !Number.isFinite(fetchMs))
        return null;
    const english = source.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?(?:\s+(\d{4}))?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*GMT([+-])(\d{1,2})(?::(\d{2}))?$/iu);
    if (english) {
        const monthIndex = ENGLISH_MONTH_INDEX.get((english[1] ?? "").toLowerCase());
        if (monthIndex === undefined)
            return null;
        let hour = Number.parseInt(english[4] ?? "", 10);
        const meridiem = english[7]?.toUpperCase();
        if (meridiem === "AM" && hour === 12)
            hour = 0;
        if (meridiem === "PM" && hour < 12)
            hour += 12;
        const year = english[3]
            ? Number.parseInt(english[3], 10)
            : new Date(fetchMs).getUTCFullYear();
        return new Date(timestampFromParts({
            year,
            monthIndex,
            day: Number.parseInt(english[2] ?? "", 10),
            hour,
            minute: Number.parseInt(english[5] ?? "", 10),
            second: Number.parseInt(english[6] ?? "0", 10),
            offsetMinutes: offsetMinutes(english[8] ?? "+", english[9] ?? "0", english[10]),
        })).toISOString();
    }
    const korean = source.match(/^(?:(\d{4})년\s*)?(\d{1,2})월\s+(\d{1,2})일,?\s*(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분(?:\s*(\d{1,2})초)?\s*GMT([+-])(\d{1,2})(?::(\d{2}))?$/u);
    if (korean) {
        let hour = Number.parseInt(korean[5] ?? "", 10);
        if (korean[4] === "오전" && hour === 12)
            hour = 0;
        if (korean[4] === "오후" && hour < 12)
            hour += 12;
        const year = korean[1]
            ? Number.parseInt(korean[1], 10)
            : new Date(fetchMs).getUTCFullYear();
        return new Date(timestampFromParts({
            year,
            monthIndex: Number.parseInt(korean[2] ?? "", 10) - 1,
            day: Number.parseInt(korean[3] ?? "", 10),
            hour,
            minute: Number.parseInt(korean[6] ?? "", 10),
            second: Number.parseInt(korean[7] ?? "0", 10),
            offsetMinutes: offsetMinutes(korean[8] ?? "+", korean[9] ?? "0", korean[10]),
        })).toISOString();
    }
    const directMs = Date.parse(source);
    return Number.isFinite(directMs) ? new Date(directMs).toISOString() : null;
}
export function assessSourceFreshness(input) {
    if (input.freshnessPolicy !== "strict_timestamp") {
        return {
            policyVersion: SOURCE_FRESHNESS_POLICY_VERSION,
            freshnessVerdict: "unknown",
            freshnessReasonCode: "freshness_not_strict",
            normalizedSourceTimestamp: normalizeSourceTimestamp(input.sourceTimestamp, input.fetchTimestamp),
            sourceAgeMs: null,
        };
    }
    if (!input.sourceTimestamp?.trim()) {
        return {
            policyVersion: SOURCE_FRESHNESS_POLICY_VERSION,
            freshnessVerdict: "unknown",
            freshnessReasonCode: "strict_source_timestamp_missing",
            normalizedSourceTimestamp: null,
            sourceAgeMs: null,
        };
    }
    const normalizedSourceTimestamp = normalizeSourceTimestamp(input.sourceTimestamp, input.fetchTimestamp);
    const fetchMs = Date.parse(input.fetchTimestamp);
    const sourceMs = normalizedSourceTimestamp ? Date.parse(normalizedSourceTimestamp) : Number.NaN;
    if (!normalizedSourceTimestamp || !Number.isFinite(fetchMs) || !Number.isFinite(sourceMs)) {
        return {
            policyVersion: SOURCE_FRESHNESS_POLICY_VERSION,
            freshnessVerdict: "unknown",
            freshnessReasonCode: "strict_source_timestamp_invalid",
            normalizedSourceTimestamp: null,
            sourceAgeMs: null,
        };
    }
    const sourceAgeMs = fetchMs - sourceMs;
    if (sourceAgeMs < -SOURCE_TIMESTAMP_FUTURE_TOLERANCE_MS) {
        return {
            policyVersion: SOURCE_FRESHNESS_POLICY_VERSION,
            freshnessVerdict: "unknown",
            freshnessReasonCode: "strict_source_timestamp_future",
            normalizedSourceTimestamp,
            sourceAgeMs,
        };
    }
    return {
        policyVersion: SOURCE_FRESHNESS_POLICY_VERSION,
        freshnessVerdict: sourceAgeMs <= STRICT_SOURCE_MAX_AGE_MS ? "fresh" : "stale",
        freshnessReasonCode: sourceAgeMs <= STRICT_SOURCE_MAX_AGE_MS
            ? "strict_source_age_within_limit"
            : "strict_source_age_exceeded",
        normalizedSourceTimestamp,
        sourceAgeMs,
    };
}
function kstDateBucket(now) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function isoTimestamp(now) {
    return now.toISOString();
}
function normalizeWhitespace(value) {
    return value.trim().replace(/\s+/g, " ");
}
function canonicalUrl(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw)
        return { href: "", domain: null };
    try {
        const url = new URL(raw);
        url.hash = "";
        url.hostname = url.hostname.toLowerCase();
        const next = new URL(`${url.protocol}//${url.host}${url.pathname}`);
        const entries = [...url.searchParams.entries()]
            .filter(([key]) => !TRACKING_QUERY_KEYS.has(key.toLowerCase()))
            .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
        for (const [key, nested] of entries)
            next.searchParams.append(key, nested);
        return { href: next.toString(), domain: next.hostname };
    }
    catch {
        return { href: raw, domain: null };
    }
}
function hashValue(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}
function webCandidateRef(value) {
    const canonical = canonicalUrl(value);
    if (!canonical.href)
        return null;
    return `web-candidate:${hashValue(canonical.href)}`;
}
export function buildWebRetrievalTransitionReceipt(input) {
    if (input.toolName === "web_fetch") {
        const candidateRef = webCandidateRef(input.policy.canonicalParams.url);
        return candidateRef
            ? { schemaVersion: 1, kind: "direct_fetch_attempt", candidateRefs: [candidateRef] }
            : null;
    }
    return null;
}
export function evaluateWebRetrievalTransitionAdmission(input) {
    const discovered = new Set();
    const attempted = new Set();
    for (const receipt of input.receipts) {
        const target = receipt.kind === "discovery" ? discovered : attempted;
        for (const candidateRef of receipt.candidateRefs)
            target.add(candidateRef);
    }
    const pendingCandidateCount = [...discovered]
        .filter((candidateRef) => !attempted.has(candidateRef))
        .length;
    return { allowed: true, pendingCandidateCount };
}
function freshnessPolicyFromParam(value) {
    if (value === "normal" || value === "latest_approximate" || value === "strict_timestamp")
        return value;
    return null;
}
function inferFreshnessPolicyFromSource(input) {
    if (input.sourceKind === "search_index" || input.sourceKind === "browser_evidence")
        return "latest_approximate";
    const href = input.href.toLowerCase();
    const domain = input.domain ?? "";
    if (domain === "www.google.com" && href.includes("/finance/quote/"))
        return "latest_approximate";
    if (domain.endsWith("investing.com") && /\/(indices|currencies|equities|crypto)\//i.test(href))
        return "latest_approximate";
    if (domain === "finance.yahoo.com" && href.includes("/quote/"))
        return "latest_approximate";
    if (domain.endsWith("finance.naver.com") || domain.endsWith("finance.daum.net"))
        return "latest_approximate";
    return "normal";
}
function sourceKindFromDomain(domain, method) {
    if (method === "browser_search")
        return "browser_evidence";
    if (!domain)
        return method === "fast_text_search" ? "search_index" : "unknown";
    if (/(go\.kr|gov|kma\.go\.kr|weather\.go\.kr|data\.go\.kr|law\.go\.kr|moleg\.go\.kr)$/i.test(domain))
        return "official";
    if (/(openai\.com|anthropic\.com|google\.com|microsoft\.com|apple\.com)$/i.test(domain))
        return "first_party";
    return method === "fast_text_search" ? "search_index" : "third_party";
}
function reliabilityFor(kind) {
    switch (kind) {
        case "official": return "high";
        case "first_party": return "high";
        case "third_party": return "medium";
        case "search_index": return "medium";
        case "browser_evidence": return "medium";
        case "unknown": return "unknown";
    }
}
export function buildWebRetrievalPolicyDecision(input) {
    const now = input.now ?? new Date();
    const fetchTimestamp = isoTimestamp(now);
    if (input.toolName === "web_search") {
        const canonicalParams = {
            query: normalizeWhitespace(typeof input.params.query === "string" ? input.params.query : ""),
            locale: normalizeWhitespace(typeof input.params.locale === "string" ? input.params.locale : input.locale ?? ""),
            maxResults: typeof input.params.maxResults === "number" ? input.params.maxResults : 8,
            safeSearch: input.params.safeSearch === "strict" ? "strict" : "moderate",
            method: "fast_text_search",
            freshnessPolicy: freshnessPolicyFromParam(input.params.freshnessPolicy) ?? "latest_approximate",
            timeBucket: kstDateBucket(now),
            sourceKind: "search_index",
        };
        return {
            applies: true,
            method: "fast_text_search",
            dedupeKey: `web:search:${hashValue(canonicalParams)}`,
            canonicalParams,
            freshnessPolicy: canonicalParams.freshnessPolicy,
            sourceKind: "search_index",
            reliability: "medium",
            fetchTimestamp,
        };
    }
    if (input.toolName !== "web_fetch")
        return null;
    const canonical = canonicalUrl(input.params.url);
    const mode = typeof input.params.mode === "string" ? input.params.mode : "text";
    const waitForSelector = typeof input.params.waitForSelector === "string" ? normalizeWhitespace(input.params.waitForSelector) : "";
    const method = waitForSelector || mode === "screenshot" ? "browser_search" : "direct_fetch";
    const sourceKind = sourceKindFromDomain(canonical.domain, method);
    const freshnessPolicy = freshnessPolicyFromParam(input.params.freshnessPolicy)
        ?? inferFreshnessPolicyFromSource({ href: canonical.href, domain: canonical.domain, method, sourceKind });
    const canonicalParams = {
        url: canonical.href,
        domain: canonical.domain,
        mode,
        waitForSelector,
        method,
        freshnessPolicy,
        timeBucket: kstDateBucket(now),
        sourceKind,
    };
    const dedupeKey = `web:fetch:${hashValue(canonicalParams)}`;
    return {
        applies: true,
        method,
        dedupeKey,
        canonicalParams,
        freshnessPolicy,
        sourceKind,
        reliability: reliabilityFor(sourceKind),
        fetchTimestamp,
    };
}
export function extractSourceTimestampFromHtml(html) {
    const patterns = [
        /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|dc\.date|pubdate|last-modified)["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|dc\.date|pubdate|last-modified)["']/i,
        /<time[^>]+datetime=["']([^"']+)["']/i,
        /"datePublished"\s*:\s*"([^"]+)"/i,
        /"dateModified"\s*:\s*"([^"]+)"/i,
        /"localTradedAt"\s*:\s*"([^"]+)"/i,
        /(\d{1,2}월\s+\d{1,2}일,\s*(?:오전|오후)\s*\d{1,2}시\s*\d{1,2}분(?:\s*\d{1,2}초)?\s*GMT[+-]\d{1,2}(?::\d{2})?)/iu,
        /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*GMT[+-]\d{1,2}(?::\d{2})?)/iu,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        const value = match?.[1]?.trim().replace(/\s+/gu, " ");
        if (value)
            return value;
    }
    return null;
}
function browserSearchEvidenceErrorMessage(error) {
    if (error == null)
        return null;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const sanitized = sanitizeUserFacingError(rawMessage);
    return redactLogText(sanitized.userMessage);
}
export function recordBrowserSearchEvidence(input) {
    const createdAt = input.createdAt ?? Date.now();
    const safeError = browserSearchEvidenceErrorMessage(input.error);
    const payload = {
        kind: "browser_search_evidence",
        query: input.query,
        url: input.url ?? null,
        extractedText: input.extractedText?.slice(0, 20_000) ?? null,
        screenshotBase64: input.screenshotBase64 ?? null,
        timeoutReason: input.timeoutReason ?? null,
        error: safeError,
        fetchTimestamp: new Date(createdAt).toISOString(),
        method: input.method ?? "browser_search",
    };
    const root = join(input.artifactStorage.rootDir, "browser-search");
    mkdirSync(root, { recursive: true });
    const fileName = `browser-search-${createdAt}-${hashValue({ query: input.query, url: input.url ?? null }).slice(0, 10)}.json`;
    const artifactPath = join(root, fileName);
    writeFileSync(artifactPath, JSON.stringify(payload, null, 2), "utf-8");
    let artifactId = null;
    let diagnosticEventId = null;
    try {
        artifactId = recordArtifactMetadata({
            artifactPath,
            mimeType: "application/json",
            sourceRunId: input.runId ?? null,
            requestGroupId: input.requestGroupId ?? null,
            ownerChannel: "browser_search",
            channelTarget: null,
            retentionPolicy: "ephemeral",
            metadata: { kind: "browser_search_evidence", query: input.query, url: input.url ?? null },
            createdAt,
            updatedAt: createdAt,
        }, input.artifactStorage);
    }
    catch {
        artifactId = null;
    }
    try {
        diagnosticEventId = insertDiagnosticEvent({
            kind: "browser_search_evidence",
            summary: input.timeoutReason ? "browser search timed out; evidence artifact captured" : "browser search evidence artifact captured",
            ...(input.runId ? { runId: input.runId } : {}),
            ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
            detail: {
                artifactPath: existsSync(artifactPath) ? artifactPath : null,
                artifactId,
                query: input.query,
                url: input.url ?? null,
                timeoutReason: input.timeoutReason ?? null,
            },
        });
    }
    catch {
        diagnosticEventId = null;
    }
    return {
        artifactPath,
        artifactId,
        diagnosticEventId,
        userMessage: "브라우저 검색 증거를 artifact로 저장했습니다.",
    };
}
//# sourceMappingURL=web-retrieval-policy.js.map