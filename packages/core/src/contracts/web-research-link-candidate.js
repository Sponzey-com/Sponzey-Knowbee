const SHA256 = /^sha256:[a-f0-9]{64}$/u;
function text(value, maxLength = 8_192) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim();
    return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}
function createCheckedFingerprint(createFingerprint, namespace, value) {
    const valueFingerprint = createFingerprint(namespace, value);
    if (!SHA256.test(valueFingerprint)) {
        throw new Error("Web research link fingerprint is invalid.");
    }
    return valueFingerprint;
}
export function projectWebResearchLinkCandidates(input, createFingerprint) {
    const runId = text(input.runId, 256);
    const parentEvidenceRef = text(input.parentEvidenceRef, 256);
    const parentProvenanceRef = text(input.parentProvenanceRef, 256);
    const documentFinalUrl = text(input.documentFinalUrl);
    if (!runId ||
        !parentEvidenceRef ||
        !parentProvenanceRef ||
        !documentFinalUrl ||
        !Number.isSafeInteger(input.maxCandidates) ||
        input.maxCandidates < 1 ||
        input.maxCandidates > 64) {
        throw new Error("Web research link projection input is invalid.");
    }
    const observedOrdinals = new Set();
    const observedUrls = new Set();
    for (const observation of input.observations) {
        if (!Number.isSafeInteger(observation.ordinal) ||
            observation.ordinal < 1 ||
            !text(observation.url) ||
            observedOrdinals.has(observation.ordinal) ||
            observedUrls.has(observation.url)) {
            throw new Error("Web research link observations are invalid.");
        }
        observedOrdinals.add(observation.ordinal);
        observedUrls.add(observation.url);
    }
    const candidates = [];
    const exclusions = [];
    const canonicalUrls = new Set();
    for (const observation of [...input.observations].sort((left, right) => left.ordinal - right.ordinal)) {
        const admissions = input.targetAdmissions.filter((admission) => admission.observedUrl === observation.url);
        if (admissions.length !== 1) {
            exclusions.push({
                ordinal: observation.ordinal,
                reasonCode: admissions.length === 0
                    ? "target_admission_missing"
                    : "target_admission_ambiguous",
            });
            continue;
        }
        const admission = admissions[0];
        if (!admission)
            continue;
        if (admission.status === "denied") {
            exclusions.push({
                ordinal: observation.ordinal,
                reasonCode: text(admission.reasonCode, 256) ?? "target_denied",
            });
            continue;
        }
        const canonicalUrl = text(admission.canonicalUrl);
        if (!canonicalUrl) {
            exclusions.push({
                ordinal: observation.ordinal,
                reasonCode: "canonical_url_invalid",
            });
            continue;
        }
        if (canonicalUrls.has(canonicalUrl)) {
            exclusions.push({
                ordinal: observation.ordinal,
                reasonCode: "duplicate_canonical_url",
            });
            continue;
        }
        if (candidates.length >= input.maxCandidates) {
            exclusions.push({
                ordinal: observation.ordinal,
                reasonCode: "candidate_limit_reached",
            });
            continue;
        }
        canonicalUrls.add(canonicalUrl);
        const discoveryPayload = {
            runId,
            parentEvidenceRef,
            parentProvenanceRef,
            documentFinalUrl,
            observationOrdinal: observation.ordinal,
            observedUrl: observation.url,
            canonicalUrl,
        };
        const discoveryFingerprint = createCheckedFingerprint(createFingerprint, "web-research-link-discovery:v1", discoveryPayload);
        const strategyFingerprint = createCheckedFingerprint(createFingerprint, "web-research-link-strategy:v1", {
            runId,
            parentEvidenceRef,
            canonicalUrl,
        });
        candidates.push(Object.freeze({
            candidateId: `web-link:${discoveryFingerprint}`,
            kind: "fetch",
            sourceUrl: canonicalUrl,
            evidenceRef: parentEvidenceRef,
            strategyFingerprint,
            discovery: Object.freeze({
                origin: "fetched_document_link",
                parentEvidenceRef,
                parentProvenanceRef,
                documentFinalUrl,
                observationOrdinal: observation.ordinal,
                discoveryFingerprint,
            }),
        }));
    }
    return Object.freeze({
        candidates: Object.freeze(candidates),
        exclusions: Object.freeze(exclusions.map((item) => Object.freeze(item))),
    });
}
//# sourceMappingURL=web-research-link-candidate.js.map