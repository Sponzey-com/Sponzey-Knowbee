import { createWebRetrievalMachine, transitionWebRetrieval, } from "./web-retrieval-state-machine.js";
export class WebRetrievalLiveRunnerError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "WebRetrievalLiveRunnerError";
        this.code = code;
    }
}
export class WebRetrievalLivePortError extends Error {
    reasonCode;
    constructor(reasonCode) {
        super(reasonCode);
        this.name = "WebRetrievalLivePortError";
        this.reasonCode = reasonCode;
    }
}
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REQUIRED_CRITERIA = ["existence", "accuracy", "freshness", "target_match"];
function exact(value, max = 2_048) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function fail(code) {
    throw new WebRetrievalLiveRunnerError(code);
}
function move(machine, event) {
    const moved = transitionWebRetrieval(machine, event);
    if (!moved.ok) {
        fail(moved.reasonCode === "web_retrieval_attempt_duplicate"
            ? "web_live_rediagnosis_strategy_duplicate"
            : "web_live_rediagnosis_invalid");
    }
    return moved.value;
}
function portFailureReason(value, fallback) {
    return value instanceof WebRetrievalLivePortError ? value.reasonCode : fallback;
}
function failReason(code) {
    if (code.startsWith("web_live_"))
        fail(code);
    throw new WebRetrievalLivePortError(code);
}
function normalizedSearchStrategy(value) {
    return value.trim().replace(/\s+/gu, " ").toLowerCase();
}
function validPublicUrl(value) {
    try {
        const parsed = new URL(value);
        return ((parsed.protocol === "https:" || parsed.protocol === "http:") &&
            !parsed.username &&
            !parsed.password &&
            Boolean(parsed.hostname));
    }
    catch {
        return false;
    }
}
function validateCandidates(value) {
    if (value.length === 0 || value.length > 16)
        return false;
    const refs = new Set();
    const urls = new Set();
    for (const candidate of value) {
        if (!exact(candidate.evidenceRef) ||
            !exact(candidate.sourceUrl) ||
            !validPublicUrl(candidate.sourceUrl) ||
            !exact(candidate.sourceDomain, 256) ||
            !exact(candidate.fetchedAt, 128) ||
            (candidate.sourceTimestamp !== null && !exact(candidate.sourceTimestamp, 128)) ||
            refs.has(candidate.evidenceRef) ||
            urls.has(candidate.sourceUrl)) {
            return false;
        }
        refs.add(candidate.evidenceRef);
        urls.add(candidate.sourceUrl);
    }
    return true;
}
function parsePlan(value, candidates) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const receipt = value;
    if (receipt.diagnosedBy !== "llm" ||
        receipt.status !== "selected" ||
        !SHA256.test(receipt.contextFingerprint ?? "") ||
        !exact(receipt.selectedEvidenceRef) ||
        !exact(receipt.selectedSourceUrl) ||
        !SHA256.test(receipt.requestedTargetFingerprint ?? "")) {
        return null;
    }
    const candidate = candidates.find((item) => item.evidenceRef === receipt.selectedEvidenceRef &&
        item.sourceUrl === receipt.selectedSourceUrl);
    if (!candidate)
        return null;
    return {
        receipt: Object.freeze({
            diagnosedBy: "llm",
            status: "selected",
            contextFingerprint: receipt.contextFingerprint,
            selectedEvidenceRef: candidate.evidenceRef,
            selectedSourceUrl: candidate.sourceUrl,
            requestedTargetFingerprint: receipt.requestedTargetFingerprint,
        }),
        candidate,
    };
}
function parseDiagnosis(value, evidenceRef, requestedTargetFingerprint, conditionCount) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const receipt = value;
    const target = receipt.targetBinding;
    if (receipt.diagnosedBy !== "llm" ||
        receipt.status !== "complete" ||
        !SHA256.test(receipt.contextFingerprint ?? "") ||
        !Array.isArray(receipt.criterionKeys) ||
        REQUIRED_CRITERIA.some((criterion) => !receipt.criterionKeys?.includes(criterion)) ||
        receipt.conditionCount !== conditionCount ||
        !Array.isArray(receipt.evidenceRefs) ||
        receipt.evidenceRefs.length !== 1 ||
        receipt.evidenceRefs[0] !== evidenceRef ||
        target?.status !== "verified" ||
        target.requestedTargetFingerprint !== requestedTargetFingerprint ||
        target.evidenceTargetFingerprint !== requestedTargetFingerprint) {
        return null;
    }
    return {
        diagnosis: Object.freeze({
            diagnosedBy: "llm",
            status: "complete",
            contextFingerprint: receipt.contextFingerprint,
            criterionKeys: Object.freeze([...receipt.criterionKeys]),
            conditionCount,
            evidenceRefs: Object.freeze([evidenceRef]),
        }),
        targetBinding: Object.freeze({
            status: "verified",
            requestedTargetFingerprint,
            evidenceTargetFingerprint: requestedTargetFingerprint,
        }),
    };
}
function parseRediagnosis(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const receipt = value;
    if (receipt.diagnosedBy !== "llm" ||
        (receipt.status !== "retry" && receipt.status !== "blocked") ||
        !SHA256.test(receipt.contextFingerprint ?? "")) {
        return null;
    }
    if (receipt.status === "blocked") {
        return Object.freeze({
            diagnosedBy: "llm",
            status: "blocked",
            contextFingerprint: receipt.contextFingerprint,
        });
    }
    const next = receipt.nextAction;
    if (next?.kind !== "search" ||
        !exact(next.searchRequest) ||
        !SHA256.test(next.attemptFingerprint ?? "")) {
        return null;
    }
    return Object.freeze({
        diagnosedBy: "llm",
        status: "retry",
        contextFingerprint: receipt.contextFingerprint,
        nextAction: Object.freeze({
            kind: "search",
            searchRequest: next.searchRequest.trim(),
            attemptFingerprint: next.attemptFingerprint,
        }),
    });
}
export async function runWebRetrievalLiveScenario(input) {
    if (!exact(input.runId, 256))
        fail("web_live_run_id_invalid");
    const maxAttempts = input.maxAttempts ?? (input.rediagnose ? 3 : 1);
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8) {
        fail("web_live_rediagnosis_invalid");
    }
    const baseExecutionInput = {
        runId: input.runId,
        scenario: input.scenario,
        signal: input.signal,
    };
    let machine = createWebRetrievalMachine();
    const ensureActive = () => {
        if (!input.signal.aborted)
            return;
        machine = move(machine, { type: "cancelled" });
        fail("web_live_cancelled");
    };
    ensureActive();
    let searchRequest = input.scenario.request;
    let searchAttemptCount = 1;
    const attemptedSearchRequests = new Set([normalizedSearchStrategy(searchRequest)]);
    machine = move(machine, {
        type: "search_planned",
        attemptFingerprint: `initial:${input.scenario.id}`,
    });
    const retry = async (failure) => {
        machine = move(machine, { type: failure.eventType, reasonCode: failure.reasonCode });
        if (!input.rediagnose)
            failReason(failure.reasonCode);
        if (searchAttemptCount >= maxAttempts) {
            machine = move(machine, {
                type: "blocked",
                reasonCode: "web_live_rediagnosis_exhausted",
            });
            fail("web_live_rediagnosis_exhausted");
        }
        ensureActive();
        const receipt = parseRediagnosis(await input.rediagnose({
            ...baseExecutionInput,
            searchRequest,
            failure: Object.freeze({
                stage: failure.stage,
                reasonCode: failure.reasonCode,
            }),
            attemptFingerprints: Object.freeze([...machine.attemptFingerprints]),
            diagnosisPayload: failure.diagnosisPayload,
        }));
        ensureActive();
        if (!receipt) {
            machine = move(machine, { type: "blocked", reasonCode: "web_live_rediagnosis_invalid" });
            fail("web_live_rediagnosis_invalid");
        }
        if (receipt.status === "blocked" || !receipt.nextAction) {
            machine = move(machine, { type: "blocked", reasonCode: "web_live_rediagnosis_blocked" });
            fail("web_live_rediagnosis_blocked");
        }
        const normalizedStrategy = normalizedSearchStrategy(receipt.nextAction.searchRequest);
        if (attemptedSearchRequests.has(normalizedStrategy)) {
            machine = move(machine, {
                type: "blocked",
                reasonCode: "web_live_rediagnosis_strategy_duplicate",
            });
            fail("web_live_rediagnosis_strategy_duplicate");
        }
        machine = move(machine, {
            type: "search_planned",
            attemptFingerprint: receipt.nextAction.attemptFingerprint,
        });
        searchRequest = receipt.nextAction.searchRequest;
        attemptedSearchRequests.add(normalizedStrategy);
        searchAttemptCount += 1;
    };
    for (;;) {
        const executionInput = { ...baseExecutionInput, searchRequest };
        machine = move(machine, { type: "search_started" });
        let search;
        try {
            search = await input.search(executionInput);
        }
        catch (error) {
            ensureActive();
            await retry({
                stage: "search",
                reasonCode: portFailureReason(error, "web_live_search_evidence_invalid"),
                diagnosisPayload: null,
                eventType: "search_failed",
            });
            continue;
        }
        ensureActive();
        if (!validateCandidates(search.candidates)) {
            await retry({
                stage: "search",
                reasonCode: "web_live_search_evidence_invalid",
                diagnosisPayload: search.diagnosisPayload,
                eventType: "search_failed",
            });
            continue;
        }
        if (!exact(search.auditEventId)) {
            await retry({
                stage: "search",
                reasonCode: "web_live_search_audit_missing",
                diagnosisPayload: search.diagnosisPayload,
                eventType: "search_failed",
            });
            continue;
        }
        machine = move(machine, { type: "search_succeeded" });
        const planned = parsePlan(await input.plan({
            ...executionInput,
            candidates: Object.freeze(search.candidates.map((item) => Object.freeze({ ...item }))),
            diagnosisPayload: search.diagnosisPayload,
        }), search.candidates);
        ensureActive();
        if (!planned) {
            await retry({
                stage: "selection",
                reasonCode: "web_live_llm_source_selection_invalid",
                diagnosisPayload: search.diagnosisPayload,
                eventType: "verification_failed",
            });
            continue;
        }
        const fetchPlan = transitionWebRetrieval(machine, {
            type: "fetch_planned",
            attemptFingerprint: `fetch:${planned.candidate.evidenceRef}`,
        });
        if (!fetchPlan.ok) {
            await retry({
                stage: "selection",
                reasonCode: "web_live_llm_source_selection_invalid",
                diagnosisPayload: search.diagnosisPayload,
                eventType: "verification_failed",
            });
            continue;
        }
        machine = fetchPlan.value;
        machine = move(machine, { type: "fetch_started" });
        let fetched;
        try {
            fetched = await input.fetch({ ...executionInput, candidate: planned.candidate });
        }
        catch (error) {
            ensureActive();
            await retry({
                stage: "fetch",
                reasonCode: portFailureReason(error, "web_live_fetch_evidence_invalid"),
                diagnosisPayload: null,
                eventType: "fetch_failed",
            });
            continue;
        }
        ensureActive();
        if (!exact(fetched.evidenceRef) ||
            !exact(fetched.sourceDomain, 256) ||
            !exact(fetched.sourceTimestamp, 128) ||
            !exact(fetched.fetchedAt, 128)) {
            await retry({
                stage: "fetch",
                reasonCode: "web_live_fetch_evidence_invalid",
                diagnosisPayload: fetched.diagnosisPayload,
                eventType: "fetch_failed",
            });
            continue;
        }
        if (!exact(fetched.auditEventId)) {
            await retry({
                stage: "fetch",
                reasonCode: "web_live_fetch_audit_missing",
                diagnosisPayload: fetched.diagnosisPayload,
                eventType: "fetch_failed",
            });
            continue;
        }
        machine = move(machine, { type: "fetch_succeeded" });
        machine = move(machine, { type: "verification_started" });
        const diagnosed = parseDiagnosis(await input.diagnose({
            ...executionInput,
            evidenceRef: fetched.evidenceRef,
            requestedTargetFingerprint: planned.receipt.requestedTargetFingerprint,
            diagnosisPayload: fetched.diagnosisPayload,
        }), fetched.evidenceRef, planned.receipt.requestedTargetFingerprint, input.scenario.completionConditions.length);
        ensureActive();
        if (!diagnosed) {
            await retry({
                stage: "verification",
                reasonCode: "web_live_llm_result_diagnosis_invalid",
                diagnosisPayload: fetched.diagnosisPayload,
                eventType: "verification_failed",
            });
            continue;
        }
        machine = move(machine, { type: "verification_completed" });
        return Object.freeze({
            attemptedMethods: Object.freeze(["fast_text_search", "direct_fetch"]),
            sourceDomains: Object.freeze([fetched.sourceDomain]),
            answerProduced: machine.state === "COMPLETED",
            resultDiagnosis: diagnosed.diagnosis,
            liveAcceptance: Object.freeze({
                auditEventId: fetched.auditEventId,
                redactionStatus: "verified",
                targetBinding: diagnosed.targetBinding,
                sourceEvidence: Object.freeze([
                    Object.freeze({
                        evidenceRef: fetched.evidenceRef,
                        sourceDomain: fetched.sourceDomain,
                        sourceTimestamp: fetched.sourceTimestamp,
                        fetchedAt: fetched.fetchedAt,
                    }),
                ]),
            }),
            finalText: null,
        });
    }
}
//# sourceMappingURL=web-retrieval-live-runner.js.map