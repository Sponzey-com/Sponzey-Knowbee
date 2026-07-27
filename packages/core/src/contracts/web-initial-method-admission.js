import { createHash } from "node:crypto";
import { isIP } from "node:net";
const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_SENTENCE_PUNCTUATION = /[),.;!?]+$/u;
function freshness(value) {
    return value === "latest_approximate" || value === "strict_timestamp"
        ? value
        : "normal";
}
function canonicalPublicUrl(value) {
    try {
        const url = new URL(value);
        if ((url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password ||
            !url.hostname ||
            url.hostname === "localhost" ||
            url.hostname.endsWith(".localhost")) {
            return null;
        }
        const hostname = url.hostname.replace(/^\[|\]$/gu, "");
        // Literal IP targets are never admitted here. DNS and redirect admission remain
        // the responsibility of the web-fetch boundary immediately before network I/O.
        if (isIP(hostname))
            return null;
        return url.toString();
    }
    catch {
        return null;
    }
}
function userUrlCandidates(userRequest) {
    const candidates = new Set();
    for (const match of userRequest.matchAll(URL_CANDIDATE_PATTERN)) {
        const raw = match[0]?.replace(TRAILING_SENTENCE_PUNCTUATION, "");
        if (!raw)
            continue;
        const canonical = canonicalPublicUrl(raw);
        if (canonical)
            candidates.add(canonical);
    }
    return candidates;
}
export function readUserWebUrlCandidates(userRequest) {
    return [...userUrlCandidates(userRequest)];
}
function fingerprint(value) {
    const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    return `sha256:${digest}`;
}
function rejected(reasonCode) {
    return Object.freeze({ ok: false, reasonCode });
}
export function admitInitialWebResearchMethod(input) {
    const runId = input.runId.trim();
    const ownerAgentId = input.ownerAgentId.trim();
    if (!runId ||
        !ownerAgentId ||
        input.scope.runId !== runId ||
        input.scope.ownerAgentId !== ownerAgentId ||
        !input.scope.receiptId.trim() ||
        !input.scope.toolNames.includes(input.toolName)) {
        return rejected("web_initial_method_scope_mismatch");
    }
    let action;
    if (input.toolName === "web_search") {
        const query = typeof input.params.query === "string" ? input.params.query.trim() : "";
        if (!query || query.length > 512) {
            return rejected("web_initial_method_proposal_invalid");
        }
        action = Object.freeze({
            kind: "execute_search",
            query,
            freshnessPolicy: freshness(input.params.freshnessPolicy),
        });
    }
    else if (input.toolName === "web_fetch") {
        const rawUrl = typeof input.params.url === "string" ? input.params.url.trim() : "";
        if (!rawUrl)
            return rejected("web_initial_method_proposal_invalid");
        const sourceUrl = canonicalPublicUrl(rawUrl);
        if (!sourceUrl)
            return rejected("web_initial_method_fetch_candidate_invalid");
        const observedCandidate = input.observedFetchCandidates?.find((candidate) => candidate.sourceUrl === sourceUrl);
        const observedSearchResult = input.observedSearchResults?.find((candidate) => canonicalPublicUrl(candidate.sourceUrl) === sourceUrl);
        const fromUser = userUrlCandidates(input.userRequest).has(sourceUrl);
        if (!fromUser && !observedSearchResult && !observedCandidate) {
            return rejected("web_initial_method_fetch_candidate_missing");
        }
        action = Object.freeze({
            kind: "execute_fetch",
            sourceUrl,
            freshnessPolicy: freshness(input.params.freshnessPolicy),
            candidateOrigin: fromUser
                ? "user_url"
                : observedSearchResult
                    ? "search_result"
                    : "fetched_document_link",
            ...(observedCandidate
                ? {
                    candidateId: observedCandidate.candidateId,
                    parentEvidenceRef: observedCandidate.discovery.parentEvidenceRef,
                    discoveryFingerprint: observedCandidate.discovery.discoveryFingerprint,
                }
                : observedSearchResult
                    ? { parentEvidenceRef: observedSearchResult.evidenceRef }
                    : {}),
        });
    }
    else {
        return rejected("web_initial_method_proposal_invalid");
    }
    const proposalFingerprint = fingerprint({
        runId,
        capabilityReceiptId: input.scope.receiptId,
        action,
    });
    const receiptDigest = proposalFingerprint.slice("sha256:".length, "sha256:".length + 32);
    return Object.freeze({
        ok: true,
        action,
        receipt: Object.freeze({
            schemaVersion: 1,
            diagnosedBy: "llm_tool_call",
            receiptId: `receipt:web-method:${receiptDigest}`,
            runId,
            capabilityReceiptId: input.scope.receiptId,
            proposalFingerprint,
        }),
    });
}
//# sourceMappingURL=web-initial-method-admission.js.map