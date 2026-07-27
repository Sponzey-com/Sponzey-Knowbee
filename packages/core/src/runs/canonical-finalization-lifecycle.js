import { createHash } from "node:crypto";
import { evaluateCompletionReviewCriterionGate, evaluateCompletionReviewTerminalGate, } from "../agent/completion-review.js";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
export function buildCanonicalPolicyBlockedDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    const reasonCode = required(input.reasonCode, "Policy reason code");
    if (!/^[a-z][a-z0-9_]{0,127}$/u.test(reasonCode)) {
        return { ok: false, reasonCode: "canonical_policy_reason_invalid" };
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(input.policyFingerprint)) {
        return { ok: false, reasonCode: "canonical_policy_fingerprint_invalid" };
    }
    if (!input.safeAlternativesExhausted) {
        return { ok: false, reasonCode: "canonical_policy_alternatives_not_exhausted" };
    }
    const capabilityRefs = [...new Set(input.capabilityRefs.map((ref) => ref.trim()).filter(Boolean))].sort();
    if (capabilityRefs.length === 0) {
        return { ok: false, reasonCode: "canonical_policy_capability_refs_missing" };
    }
    const workId = canonicalWorkIdForRootRun(runId);
    return {
        ok: true,
        descriptor: {
            runId,
            workId,
            event: "POLICY_BLOCKED",
            receipt: buildReceipt({
                runId,
                workId,
                stage: "policy-blocked",
                kind: "policy",
                evidence: {
                    reasonCode,
                    policyFingerprint: input.policyFingerprint,
                    capabilityRefs,
                    safeAlternativesExhausted: true,
                },
                evidenceRefs: [
                    `policy-decision:${runId}:${input.policyFingerprint.slice(-24)}`,
                    ...capabilityRefs,
                ],
                terminalCause: {
                    schemaVersion: 1,
                    originStage: "policy_admission",
                    outcomeKind: "policy_block",
                    reasonCode,
                    safeAlternativesExhausted: true,
                },
            }),
        },
    };
}
export function buildCanonicalCancellationDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    const cancellationTokenId = required(input.cancellationTokenId, "Cancellation token ID");
    if (cancellationTokenId !== `root-run:${runId}`) {
        return { ok: false, reasonCode: "canonical_cancellation_scope_mismatch" };
    }
    if (input.cancellationKind === "runtime_abort" && !input.signalAborted) {
        return { ok: false, reasonCode: "canonical_cancellation_abort_evidence_missing" };
    }
    const workId = canonicalWorkIdForRootRun(runId);
    const tokenFingerprint = `sha256:${hash(cancellationTokenId)}`;
    return {
        ok: true,
        descriptor: {
            runId,
            workId,
            event: "USER_CANCELLED",
            receipt: buildReceipt({
                runId,
                workId,
                stage: "cancellation",
                kind: "cancellation",
                evidence: {
                    cancellationKind: input.cancellationKind,
                    tokenFingerprint,
                    signalAborted: input.signalAborted,
                },
                evidenceRefs: [`cancellation-token:${tokenFingerprint.slice(-24)}`],
            }),
        },
    };
}
export function buildCanonicalRecoveredDeliveryDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    const committedLedgerEventId = required(input.committedLedgerEventId, "Committed ledger event ID");
    const deliveryKey = required(input.deliveryKey, "Delivery key");
    const idempotencyKey = required(input.idempotencyKey, "Idempotency key");
    const workId = canonicalWorkIdForRootRun(runId);
    const evidence = {
        committedLedgerEventFingerprint: `sha256:${hash(committedLedgerEventId)}`,
        deliveryKeyFingerprint: `sha256:${hash(deliveryKey)}`,
        idempotencyKeyFingerprint: `sha256:${hash(idempotencyKey)}`,
        finalOutcome: input.finalOutcome,
    };
    return {
        ok: true,
        descriptor: {
            runId,
            workId,
            event: "REPORT_DELIVERED",
            finalOutcome: input.finalOutcome,
            receipt: buildReceipt({
                runId,
                workId,
                stage: "recovered-delivery",
                kind: "delivery",
                evidence,
                evidenceRefs: [
                    `ledger-event:${evidence.committedLedgerEventFingerprint.slice(-24)}`,
                    `delivery-key:${evidence.deliveryKeyFingerprint.slice(-24)}`,
                    `idempotency-key:${evidence.idempotencyKeyFingerprint.slice(-24)}`,
                ],
            }),
        },
    };
}
export function buildCanonicalPolicyInputRequiredDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    const reasonCode = required(input.reasonCode, "Policy reason code");
    if (!/^sha256:[a-f0-9]{64}$/u.test(input.policyFingerprint)) {
        return { ok: false, reasonCode: "canonical_policy_fingerprint_invalid" };
    }
    const capabilityRefs = [...new Set(input.capabilityRefs.map((ref) => ref.trim()).filter(Boolean))].sort();
    const workId = canonicalWorkIdForRootRun(runId);
    return {
        ok: true,
        descriptor: {
            runId,
            workId,
            event: "INPUT_REQUIRED",
            waitingKind: input.waitingKind,
            receipt: buildReceipt({
                runId,
                workId,
                stage: "policy-input-required",
                kind: "input_requirement",
                evidence: { reasonCode, policyFingerprint: input.policyFingerprint, capabilityRefs, waitingKind: input.waitingKind },
                evidenceRefs: [
                    `policy-input:${runId}:${input.policyFingerprint.slice(-24)}`,
                    `policy-reason:${reasonCode}`,
                    ...capabilityRefs,
                ],
            }),
        },
    };
}
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function buildReceipt(input) {
    const evidenceFingerprint = `sha256:${hash(JSON.stringify(input.evidence))}`;
    return {
        receiptId: `receipt:${input.stage}:${input.runId}:${evidenceFingerprint.slice(-24)}`,
        workId: input.workId,
        kind: input.kind,
        evidenceFingerprint,
        evidenceRefs: [...new Set(input.evidenceRefs.map((ref) => required(ref, "Evidence ref")))],
        ...(input.evidenceMap ? { evidence: input.evidenceMap } : {}),
        ...(input.terminalCause ? { terminalCause: input.terminalCause } : {}),
    };
}
function sameTerminalCause(left, right) {
    if (!left || !right)
        return left === right;
    return left.schemaVersion === right.schemaVersion
        && left.originStage === right.originStage
        && left.outcomeKind === right.outcomeKind
        && left.reasonCode === right.reasonCode
        && left.safeAlternativesExhausted === right.safeAlternativesExhausted;
}
function buildCompletionEvidenceMap(review) {
    if (!review)
        return undefined;
    const criterionEvidenceRefs = (review.criterionAssessments ?? [])
        .filter((assessment) => assessment.applicable)
        .map((assessment) => ({
        criterionKey: assessment.criterionKey,
        evidenceRefs: [...assessment.evidenceRefs].sort(),
    }))
        .sort((left, right) => left.criterionKey.localeCompare(right.criterionKey));
    const conditionEvidenceRefs = (review.conditionAssessments ?? [])
        .map((assessment) => ({
        conditionId: assessment.conditionId,
        evidenceRefs: [...assessment.evidenceRefs].sort(),
    }))
        .sort((left, right) => left.conditionId.localeCompare(right.conditionId));
    if (criterionEvidenceRefs.length === 0 && conditionEvidenceRefs.length === 0)
        return undefined;
    return {
        ...(criterionEvidenceRefs.length > 0 ? { criterionEvidenceRefs } : {}),
        ...(conditionEvidenceRefs.length > 0 ? { conditionEvidenceRefs } : {}),
    };
}
function validateLlmDiagnosisContext(input) {
    if (!input.expected || !input.review?.contextReceipt) {
        return "canonical_llm_result_diagnosis_context_missing";
    }
    if (input.expected.evidenceRefs.length === 0) {
        return "canonical_llm_result_diagnosis_evidence_missing";
    }
    const actual = input.review.contextReceipt;
    if (actual.contextFingerprint !== input.expected.contextFingerprint
        || actual.requestFingerprint !== input.expected.requestFingerprint
        || actual.candidateFingerprint !== input.expected.candidateFingerprint
        || actual.evidenceFingerprint !== input.expected.evidenceFingerprint
        || actual.conditionsFingerprint !== input.expected.conditionsFingerprint
        || JSON.stringify(actual.evidenceRefs) !== JSON.stringify(input.expected.evidenceRefs)) {
        return "canonical_llm_result_diagnosis_context_mismatch";
    }
    return null;
}
export function buildCanonicalCompletionOutcomeDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    if (input.application.kind === "retry")
        return { ok: true, descriptor: null };
    const workId = canonicalWorkIdForRootRun(runId);
    const previewFingerprint = `sha256:${hash(input.preview)}`;
    if (input.application.kind === "complete" && !input.state.completionSatisfied) {
        return { ok: false, reasonCode: "canonical_completion_state_contradiction" };
    }
    if (input.application.kind === "complete") {
        if (input.requiresLlmResultDiagnosis && !input.review) {
            return { ok: false, reasonCode: "canonical_llm_result_diagnosis_missing" };
        }
        if (input.requiresLlmResultDiagnosis) {
            const contextFailure = validateLlmDiagnosisContext({
                review: input.review,
                expected: input.expectedLlmDiagnosisContext,
            });
            if (contextFailure)
                return { ok: false, reasonCode: contextFailure };
            const criterionGate = evaluateCompletionReviewCriterionGate({
                review: input.review,
                allowedEvidenceRefs: input.expectedLlmDiagnosisContext.evidenceRefs,
                expectedConditions: input.expectedLlmDiagnosisConditions ?? [],
            });
            if (!criterionGate.ok) {
                return { ok: false, reasonCode: `canonical_${criterionGate.reasonCode}` };
            }
        }
        if (!input.preview.trim()) {
            return { ok: false, reasonCode: "canonical_completion_evidence_missing" };
        }
        if (input.review && (input.review.status !== "complete" || input.review.remainingItems.length > 0)) {
            return { ok: false, reasonCode: "canonical_completion_review_not_complete" };
        }
        const completedChecklist = input.state.checklist?.items
            .filter((item) => item.status === "completed")
            .map((item) => item.key)
            .sort() ?? [];
        if (completedChecklist.length === 0 || (input.state.checklist?.pendingCount ?? 1) > 0) {
            return { ok: false, reasonCode: "canonical_completion_checklist_incomplete" };
        }
        const reviewFingerprint = `sha256:${hash(JSON.stringify({
            status: input.review?.status ?? "deterministic_complete",
            summary: input.review?.summary ?? "",
            reason: input.review?.reason ?? "",
            remainingItems: input.review?.remainingItems ?? [],
        }))}`;
        const evidenceMap = buildCompletionEvidenceMap(input.review);
        return {
            ok: true,
            descriptor: {
                runId,
                workId,
                event: "ALL_CRITERIA_VERIFIED",
                receipt: buildReceipt({
                    runId,
                    workId,
                    stage: "completion-verification",
                    kind: "verification",
                    evidence: {
                        previewFingerprint,
                        reviewFingerprint,
                        completedChecklist,
                        evidenceMap: evidenceMap ?? null,
                    },
                    evidenceRefs: [
                        `completion-preview:${runId}:${previewFingerprint.slice(-24)}`,
                        `completion-review:${runId}:${reviewFingerprint.slice(-24)}`,
                        ...completedChecklist.map((key) => `completion-criterion:${key}`),
                    ],
                    evidenceMap,
                }),
            },
        };
    }
    if (input.application.kind === "stop"
        && (input.review?.status === "blocked"
            || input.review?.status === "paths_exhausted")
        && input.requiresLlmResultDiagnosis) {
        const contextFailure = validateLlmDiagnosisContext({
            review: input.review,
            expected: input.expectedLlmDiagnosisContext,
        });
        if (contextFailure)
            return { ok: false, reasonCode: contextFailure };
        const expectedContext = input.expectedLlmDiagnosisContext;
        const criterionGate = evaluateCompletionReviewCriterionGate({
            review: input.review,
            allowedEvidenceRefs: expectedContext.evidenceRefs,
            expectedConditions: input.expectedLlmDiagnosisConditions ?? [],
        });
        if (!criterionGate.ok) {
            return { ok: false, reasonCode: `canonical_${criterionGate.reasonCode}` };
        }
        const terminalGate = evaluateCompletionReviewTerminalGate({
            review: input.review,
            allowedEvidenceRefs: expectedContext.evidenceRefs,
        });
        if (!terminalGate.ok) {
            return { ok: false, reasonCode: `canonical_${terminalGate.reasonCode}` };
        }
        const terminalEvidence = input.review.terminalEvidence;
        const terminalEvidenceRefs = [
            ...new Set([
                ...terminalEvidence.blockerEvidenceRefs,
                ...terminalEvidence.evaluatedAlternativeEvidenceRefs,
                ...terminalEvidence.excludedCandidateEvidenceRefs,
            ]),
        ].sort();
        const pathsExhausted = input.review.status === "paths_exhausted";
        const reviewFingerprint = `sha256:${hash(JSON.stringify({
            status: input.review.status,
            summary: input.review.summary,
            reason: input.review.reason,
            remainingItems: input.review.remainingItems,
        }))}`;
        const evidenceMap = buildCompletionEvidenceMap(input.review);
        return {
            ok: true,
            descriptor: {
                runId,
                workId,
                event: pathsExhausted ? "PATHS_EXHAUSTED" : "RESULT_BLOCKED",
                receipt: buildReceipt({
                    runId,
                    workId,
                    stage: pathsExhausted ? "result-exhaustion" : "result-blocker",
                    kind: pathsExhausted ? "exhaustion" : "blocker",
                    evidence: {
                        previewFingerprint,
                        reviewFingerprint,
                        reviewContextFingerprint: expectedContext.contextFingerprint,
                        evidenceMap: evidenceMap ?? null,
                        terminalEvidenceRefs,
                    },
                    evidenceRefs: [
                        expectedContext.receiptId,
                        ...expectedContext.evidenceRefs,
                        ...terminalEvidenceRefs,
                    ],
                    evidenceMap,
                    terminalCause: {
                        schemaVersion: 1,
                        originStage: "result_diagnosis",
                        outcomeKind: pathsExhausted ? "exhausted" : "blocked",
                        reasonCode: pathsExhausted
                            ? "solution_paths_exhausted"
                            : "verified_result_blocker",
                        safeAlternativesExhausted: pathsExhausted,
                    },
                }),
            },
        };
    }
    if (input.application.kind === "awaiting_user") {
        const requirementFingerprint = `sha256:${hash(JSON.stringify({
            reason: input.application.reason ?? "",
            remainingItems: input.application.remainingItems ?? [],
        }))}`;
        return {
            ok: true,
            descriptor: {
                runId,
                workId,
                event: "INPUT_REQUIRED",
                receipt: buildReceipt({
                    runId,
                    workId,
                    stage: "input-requirement",
                    kind: "input_requirement",
                    evidence: { previewFingerprint, requirementFingerprint },
                    evidenceRefs: [`input-requirement:${runId}:${requirementFingerprint.slice(-24)}`],
                }),
            },
        };
    }
    return { ok: false, reasonCode: "canonical_exhaustion_authorization_missing" };
}
export function buildCanonicalDeliveryDescriptor(input) {
    const runId = required(input.runId, "Run ID");
    if (input.delivery.status !== "delivered" && input.delivery.status !== "duplicate_suppressed") {
        return { ok: false, reasonCode: `canonical_delivery_not_committed:${input.delivery.status}` };
    }
    const workId = canonicalWorkIdForRootRun(runId);
    const deliveryEvidence = {
        source: required(input.source, "Delivery source"),
        sessionFingerprint: `sha256:${hash(required(input.sessionId, "Session ID"))}`,
        textFingerprint: `sha256:${hash(required(input.text, "Delivered text"))}`,
        textSource: input.textSource,
        status: input.delivery.status,
        deliveryKeyFingerprint: `sha256:${hash(required(input.delivery.deliveryKey, "Delivery key"))}`,
        idempotencyKeyFingerprint: `sha256:${hash(required(input.delivery.idempotencyKey, "Idempotency key"))}`,
        existingEventId: input.delivery.existingEventId ?? null,
    };
    return {
        ok: true,
        descriptor: {
            runId,
            workId,
            event: "REPORT_DELIVERED",
            finalOutcome: input.finalOutcome,
            receipt: buildReceipt({
                runId,
                workId,
                stage: "final-delivery",
                kind: "delivery",
                evidence: deliveryEvidence,
                evidenceRefs: [
                    `channel:${deliveryEvidence.source}`,
                    `delivery-key:${deliveryEvidence.deliveryKeyFingerprint.slice(-24)}`,
                    ...(input.delivery.existingEventId
                        ? [`delivery-ledger:${input.delivery.existingEventId}`]
                        : []),
                ],
            }),
        },
    };
}
export function recordCanonicalFinalizationTransition(descriptor, dependencies) {
    const issued = dependencies.issueReceipt(descriptor.receipt);
    if (!issued.issued) {
        const existing = dependencies.loadReceipt(descriptor.receipt.receiptId);
        const exact = existing
            && existing.workId === descriptor.receipt.workId
            && existing.kind === descriptor.receipt.kind
            && existing.evidenceFingerprint === descriptor.receipt.evidenceFingerprint
            && existing.evidenceRefs.length === descriptor.receipt.evidenceRefs.length
            && existing.evidenceRefs.every((ref, index) => ref === descriptor.receipt.evidenceRefs[index])
            && sameTerminalCause(existing.terminalCause, descriptor.receipt.terminalCause);
        if (!exact)
            return { ok: false, reasonCode: issued.reasonCode };
        if (existing.consumedRevision !== undefined)
            return { ok: true };
    }
    const transition = dependencies.applyTransition({
        runId: descriptor.runId,
        workId: descriptor.workId,
        event: descriptor.event,
        receiptRef: descriptor.receipt.receiptId,
        ...(descriptor.finalOutcome ? { finalOutcome: descriptor.finalOutcome } : {}),
        ...(descriptor.waitingKind ? { waitingKind: descriptor.waitingKind } : {}),
    });
    return transition.status === "applied"
        ? { ok: true }
        : { ok: false, reasonCode: transition.reasonCode ?? "canonical_finalization_transition_rejected" };
}
//# sourceMappingURL=canonical-finalization-lifecycle.js.map