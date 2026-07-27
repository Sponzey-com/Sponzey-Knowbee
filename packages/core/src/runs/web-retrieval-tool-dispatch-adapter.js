import { createHash } from "node:crypto";
import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { createUntrustedEvidenceEnvelope, projectUntrustedEvidenceForPrompt, redactUntrustedEvidenceContent, } from "../security/trust-boundary.js";
import { WebRetrievalLivePortError } from "./web-retrieval-live-runner.js";
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function text(value) {
    return typeof value === "string" && value.trim() ? value : null;
}
function domain(value, fallback) {
    const explicit = text(fallback);
    if (explicit)
        return explicit;
    try {
        return new URL(value).hostname || null;
    }
    catch {
        return null;
    }
}
function evidenceRef(kind, value) {
    return `tool-result:web-${kind}:${createHash("sha256")
        .update(JSON.stringify(value))
        .digest("hex")}`;
}
function diagnosisPayload(input) {
    const redacted = redactUntrustedEvidenceContent(JSON.stringify({ output: input.result.output, details: input.result.details ?? null }));
    return projectUntrustedEvidenceForPrompt(createUntrustedEvidenceEnvelope({
        sourceKind: "web",
        sourceRef: input.evidenceRef,
        contentLabel: input.label,
        ownerScope: { ownerType: "system", ownerId: `web-live:${input.runId}` },
        content: redacted.content,
        redactionState: "redacted",
    }));
}
function candidateFrom(value, index) {
    const source = record(value);
    const provenance = record(source?.sourceEvidence) ?? source;
    const sourceUrl = text(source?.url) ?? text(provenance?.sourceUrl);
    const sourceDomain = sourceUrl
        ? domain(sourceUrl, source?.domain ?? provenance?.sourceDomain)
        : null;
    const fetchedAt = text(provenance?.fetchTimestamp);
    if (!sourceUrl || !sourceDomain || !fetchedAt)
        return null;
    const sourceTimestamp = text(provenance?.sourceTimestamp);
    return Object.freeze({
        evidenceRef: evidenceRef("search", {
            index,
            sourceUrl,
            sourceDomain,
            sourceTimestamp,
            fetchedAt,
        }),
        sourceUrl,
        sourceDomain,
        sourceTimestamp,
        fetchedAt,
    });
}
const SEARCH_FAILURES = new Set([
    "web_search_cancelled",
    "web_search_timeout",
    "web_search_network_failed",
    "web_search_provider_rejected",
    "web_search_rate_limited",
    "web_search_provider_unavailable",
    "web_search_response_too_large",
    "web_search_no_results",
    "web_search_markup_changed",
    "web_search_evidence_invalid",
]);
const FETCH_FAILURES = new Set([
    "web_document_cancelled",
    "web_document_timeout",
    "web_document_target_rejected",
    "web_document_network_failed",
    "web_document_provider_rejected",
    "web_document_content_unsupported",
    "web_document_response_too_large",
    "web_document_empty",
    "web_document_evidence_invalid",
]);
function requireSuccess(result, allowedReasons, fallback) {
    if (result.success)
        return result;
    const details = record(result.details);
    const reason = text(details?.reasonCode) ?? text(result.error);
    throw new WebRetrievalLivePortError(reason && allowedReasons.has(reason)
        ? reason
        : fallback);
}
export function createWebRetrievalToolDispatchAdapter(input) {
    const search = async (execution) => {
        const result = requireSuccess(await input.dispatcher.dispatch("web_search", {
            query: execution.searchRequest,
            maxResults: 8,
            locale: detectPrimaryMessageLanguage(execution.scenario.request) === "ko"
                ? "ko-KR"
                : "en-US",
            safeSearch: "moderate",
            freshnessPolicy: execution.scenario.freshnessPolicy,
        }, input.contextFor(execution)), SEARCH_FAILURES, "web_search_evidence_invalid");
        const details = record(result.details);
        const rawCandidates = Array.isArray(details?.results)
            ? details.results
            : Array.isArray(details?.sourceEvidence)
                ? details.sourceEvidence
                : [];
        const candidates = rawCandidates
            .map((value, index) => candidateFrom(value, index))
            .filter((value) => value !== null);
        const ref = evidenceRef("search", {
            runId: execution.runId,
            scenarioId: execution.scenario.id,
            candidates,
        });
        return {
            candidates,
            auditEventId: input.findAuditEventId({
                runId: execution.runId,
                toolName: "web_search",
            }),
            diagnosisPayload: diagnosisPayload({
                runId: execution.runId,
                evidenceRef: ref,
                label: "Web live search evidence",
                result,
            }),
        };
    };
    const fetchPort = async (execution) => {
        const result = requireSuccess(await input.dispatcher.dispatch("web_fetch", {
            url: execution.candidate.sourceUrl,
            maxLength: 20_000,
            freshnessPolicy: execution.scenario.freshnessPolicy,
        }, input.contextFor(execution)), FETCH_FAILURES, "web_document_evidence_invalid");
        const source = record(record(result.details)?.sourceEvidence);
        const sourceDomain = domain(execution.candidate.sourceUrl, source?.sourceDomain);
        const fetchedAt = text(source?.fetchTimestamp);
        if (!sourceDomain || !fetchedAt)
            throw new Error("web_live_fetch_provenance_invalid");
        const sourceTimestamp = text(source?.sourceTimestamp);
        const ref = evidenceRef("fetch", {
            runId: execution.runId,
            scenarioId: execution.scenario.id,
            sourceDomain,
            sourceTimestamp,
            fetchedAt,
            output: result.output,
        });
        return {
            evidenceRef: ref,
            sourceDomain,
            sourceTimestamp,
            fetchedAt,
            auditEventId: input.findAuditEventId({
                runId: execution.runId,
                toolName: "web_fetch",
            }),
            diagnosisPayload: diagnosisPayload({
                runId: execution.runId,
                evidenceRef: ref,
                label: "Web live fetch evidence",
                result,
            }),
        };
    };
    return Object.freeze({ search, fetch: fetchPort });
}
//# sourceMappingURL=web-retrieval-tool-dispatch-adapter.js.map