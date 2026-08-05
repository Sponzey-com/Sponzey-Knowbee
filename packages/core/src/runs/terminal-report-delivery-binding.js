import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
import { buildCanonicalResultReportFacts, } from "../contracts/canonical-result-report.js";
function acceptedReportOutcomes(finalOutcome) {
    if (finalOutcome === "partial")
        return ["partial"];
    if (finalOutcome === "blocked")
        return ["blocked"];
    if (finalOutcome === "exhausted")
        return ["blocked", "impossible"];
    return [];
}
function fingerprint(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function terminalReportRequired(finalOutcome) {
    return finalOutcome === "partial" || finalOutcome === "blocked" || finalOutcome === "exhausted";
}
export function bindTerminalReportForDelivery(input) {
    let facts;
    try {
        facts = buildCanonicalResultReportFacts(input.facts);
    }
    catch {
        return { ok: false, reasonCode: "terminal_report_invalid" };
    }
    if (facts.workId !== canonicalWorkIdForRootRun(input.runId)) {
        return { ok: false, reasonCode: "terminal_report_work_mismatch" };
    }
    if (!acceptedReportOutcomes(input.finalOutcome).includes(facts.outcome)) {
        return { ok: false, reasonCode: "terminal_report_outcome_mismatch" };
    }
    const reviewInput = JSON.stringify({
        schemaVersion: 1,
        result: facts.outcome,
        language: facts.primaryLanguage,
        completedScope: facts.completedScope,
        unresolvedScope: facts.unresolvedScope,
        verifiedReasonFacts: facts.verifiedReasonFacts,
        nextActions: facts.nextActions,
        draftText: input.draftText.trim(),
    });
    return {
        ok: true,
        facts,
        reportFingerprint: fingerprint(JSON.stringify(facts)),
        reviewInput,
    };
}
export function reviewTerminalReportResponse(input) {
    const text = input.responseText.trim();
    const requiredResultWord = input.facts.primaryLanguage === "ko"
        ? input.facts.outcome === "partial"
            ? "부분"
            : input.facts.outcome === "blocked"
                ? "차단"
                : input.facts.outcome === "impossible"
                    ? "불가능"
                    : "완료"
        : input.facts.outcome;
    const fields = [
        ["result", requiredResultWord],
        ...input.facts.completedScope.map((value, index) => [`completedScope[${index}]`, value]),
        ...input.facts.unresolvedScope.map((value, index) => [`unresolvedScope[${index}]`, value]),
        ...input.facts.verifiedReasonFacts.map((value, index) => [`verifiedReasonFacts[${index}]`, value]),
        ...input.facts.nextActions.map((value, index) => [`nextActions[${index}]`, value.text]),
    ];
    const missingRequiredFragments = fields
        .filter(([field, value]) => field === "result"
        ? !text.toLocaleLowerCase().includes(value.toLocaleLowerCase())
        : !text.includes(value))
        .map(([field, value]) => ({ field, value }));
    return {
        ok: missingRequiredFragments.length === 0,
        missingFields: missingRequiredFragments.map(({ field }) => field),
        missingRequiredFragments,
    };
}
//# sourceMappingURL=terminal-report-delivery-binding.js.map