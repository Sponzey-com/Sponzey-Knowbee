import { authorizeDiagnosisActionRoute, } from "./diagnosis-action-routing.js";
export const REQUIRED_SOLUTION_PATHS = [
    "direct_answer",
    "plan",
    "tool",
    "sub_agent",
    "yeonjang",
    "ask_clarification",
    "partial_completion",
    "workaround_guidance",
];
export function assessSolutionPathExhaustion(reviews) {
    const byPath = new Map();
    for (const review of reviews) {
        if (byPath.has(review.path))
            throw new Error(`duplicate solution path review: ${review.path}`);
        if (!review.reasonCode.trim())
            throw new Error(`solution path review requires reasonCode: ${review.path}`);
        if (review.disposition === "completed_partial" && !hasNonEmptyValues(review.resultRefs)) {
            throw new Error("completed_partial solution path review requires resultRefs");
        }
        if (review.disposition === "guidance_ready" && !review.guidance?.trim()) {
            throw new Error("guidance_ready solution path review requires guidance");
        }
        byPath.set(review.path, review);
    }
    const reviewedPaths = REQUIRED_SOLUTION_PATHS.filter((path) => byPath.has(path));
    const missingPaths = REQUIRED_SOLUTION_PATHS.filter((path) => !byPath.has(path));
    const partialResultRefs = uniqueNonEmpty(reviews.flatMap((review) => review.disposition === "completed_partial" ? review.resultRefs ?? [] : []));
    const workaroundGuidance = uniqueNonEmpty(reviews.flatMap((review) => review.disposition === "guidance_ready" ? [review.guidance ?? ""] : []));
    const complete = missingPaths.length === 0;
    const hasAvailablePath = reviews.some((review) => review.disposition === "available");
    return {
        complete,
        canFinalizeFailure: complete && !hasAvailablePath,
        reviewedPaths,
        missingPaths,
        partialResultRefs,
        workaroundGuidance,
    };
}
export function assessAuthorizedSolutionPathExhaustion(input) {
    const route = authorizeDiagnosisActionRoute({
        receipt: input.receipt,
        subjectPayload: input.subjectPayload,
        diagnosis: input.diagnosis,
    });
    if (route.routeKind !== "partial_report" && route.routeKind !== "blocked") {
        throw new Error("Solution-path exhaustion requires partial_report or stop_blocked diagnosis action.");
    }
    const attemptSignatures = new Set();
    for (const review of input.reviews) {
        if (!hasNonEmptyValues(review.evidenceRefs)) {
            throw new Error(`Solution path review requires evidence: ${review.path}.`);
        }
        if (!review.applicable && review.disposition !== "reviewed_unavailable") {
            throw new Error(`Non-applicable solution path must be reviewed_unavailable: ${review.path}.`);
        }
        if (review.applicable && review.disposition === "reviewed_unavailable" && !review.reasonCode.trim()) {
            throw new Error(`Unavailable applicable solution path requires a reason: ${review.path}.`);
        }
        if (review.disposition === "attempted") {
            const signature = review.attemptSignature?.trim();
            if (!signature)
                throw new Error(`Attempted solution path requires attemptSignature: ${review.path}.`);
            if (attemptSignatures.has(signature))
                throw new Error(`Duplicate unchanged attempt: ${signature}.`);
            attemptSignatures.add(signature);
        }
    }
    const base = assessSolutionPathExhaustion(input.reviews);
    if (!base.complete) {
        throw new Error(`Unreviewed solution paths: ${base.missingPaths.join(", ")}.`);
    }
    return {
        ...base,
        canFinalizeFailure: base.canFinalizeFailure && route.routeKind === "blocked",
        receiptId: route.receiptId,
        nextAction: route.routeKind === "blocked" ? "stop_blocked" : "partial_report",
        reviews: input.reviews.map((review) => ({
            ...review,
            evidenceRefs: uniqueNonEmpty(review.evidenceRefs),
            ...(review.resultRefs ? { resultRefs: uniqueNonEmpty(review.resultRefs) } : {}),
            ...(review.guidance ? { guidance: review.guidance.trim() } : {}),
            ...(review.attemptSignature ? { attemptSignature: review.attemptSignature.trim() } : {}),
        })),
    };
}
export function buildTerminalFailurePayload(input) {
    if (!input.assessment.canFinalizeFailure || input.assessment.nextAction !== "stop_blocked") {
        throw new Error("Terminal failure payload requires an exhausted stop_blocked assessment.");
    }
    const conciseReason = input.conciseReason.trim();
    if (!conciseReason)
        throw new Error("Terminal failure payload requires a concise reason.");
    const unresolvedScope = uniqueNonEmpty(input.unresolvedScope);
    if (unresolvedScope.length === 0)
        throw new Error("Terminal failure payload requires unresolved scope.");
    const userActions = uniqueNonEmpty(input.userActions);
    if (userActions.length === 0)
        throw new Error("Terminal failure payload requires at least one user action.");
    assertAssessmentPartialResultsPreserved(input.assessment);
    return {
        status: "blocked",
        conciseReason,
        attemptedPaths: input.assessment.reviews
            .filter((review) => review.disposition === "attempted")
            .map((review) => review.path),
        partialResultRefs: [...input.assessment.partialResultRefs],
        unresolvedScope,
        workaroundGuidance: [...input.assessment.workaroundGuidance],
        userActions,
        diagnosisReceiptId: input.assessment.receiptId,
    };
}
export function buildPartialCompletionPayload(input) {
    if (input.assessment.nextAction !== "partial_report") {
        throw new Error("Partial completion payload requires a partial_report assessment.");
    }
    assertAssessmentPartialResultsPreserved(input.assessment);
    if (input.assessment.partialResultRefs.length === 0) {
        throw new Error("Partial completion payload requires partial result references.");
    }
    const unresolvedScope = uniqueNonEmpty(input.unresolvedScope);
    if (unresolvedScope.length === 0)
        throw new Error("Partial completion payload requires unresolved scope.");
    const nextActions = uniqueNonEmpty(input.nextActions);
    if (nextActions.length === 0)
        throw new Error("Partial completion payload requires next actions.");
    return {
        status: "partial",
        partialResultRefs: [...input.assessment.partialResultRefs],
        unresolvedScope,
        nextActions,
        diagnosisReceiptId: input.assessment.receiptId,
    };
}
function assertAssessmentPartialResultsPreserved(assessment) {
    const expected = uniqueNonEmpty(assessment.reviews.flatMap((review) => review.disposition === "completed_partial" ? review.resultRefs ?? [] : []));
    const actual = uniqueNonEmpty(assessment.partialResultRefs);
    if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
        throw new Error("Assessment must preserve every partial result reference.");
    }
}
function hasNonEmptyValues(values) {
    return values?.some((value) => value.trim().length > 0) === true;
}
function uniqueNonEmpty(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
//# sourceMappingURL=solution-path-exhaustion.js.map