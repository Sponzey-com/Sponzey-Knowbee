import { admitLlmCapabilitySelection, createLlmCapabilitySelectionReceipt, projectLlmCapabilitySelectionProviderInput, validateLlmCapabilitySelectionDecision, } from "../contracts/llm-capability-selection.js";
function validSelectionContext(context) {
    return Boolean(context.goal.trim() &&
        context.completionCriteria.length > 0 &&
        context.completionCriteria.every((item) => item.trim()) &&
        context.constraints.every((item) => item.trim()) &&
        context.failedStrategyFingerprints.every((item) => item.trim()));
}
export async function executeCapabilitySelection(input) {
    if (!validSelectionContext(input.selectionContext)) {
        return finalizeWithTrace(input, {
            status: "failed",
            reasonCode: "capability_selection_context_invalid",
            attemptCount: 0,
        }, traceEvidence(0));
    }
    let providerInput;
    try {
        providerInput = projectLlmCapabilitySelectionProviderInput({
            runId: input.runId,
            capabilitySnapshot: input.capabilitySnapshot,
            selectionContext: input.selectionContext,
        });
    }
    catch {
        return finalizeWithTrace(input, {
            status: "failed",
            reasonCode: "capability_selection_provider_failed",
            attemptCount: 0,
        }, traceEvidence(0));
    }
    const initial = await safeAttempt(() => input.provider.attemptCapabilitySelection(providerInput));
    const initialTerminal = terminalAttemptResult(initial, 1);
    if (initialTerminal) {
        return finalizeWithTrace(input, initialTerminal, traceEvidence(1));
    }
    const initialValidation = initial.status === "completed"
        ? validateLlmCapabilitySelectionDecision(initial.output)
        : {
            valid: false,
            reasonCodes: [initial.reasonCode],
        };
    let selected = initial;
    let validation = initialValidation;
    let attemptCount = 1;
    const observedValidationCodes = initialValidation.valid === false ? [...initialValidation.reasonCodes] : [];
    if (validation.valid === false) {
        if (!input.repairProvider) {
            return finalizeWithTrace(input, invalidOutputResult(validation.reasonCodes, attemptCount), traceEvidence(attemptCount, observedValidationCodes));
        }
        const validationReasonCodes = validation.reasonCodes;
        const repaired = await safeAttempt(() => input.repairProvider.repairCapabilitySelection({
            subject: providerInput,
            ...(selected.status === "completed" ? { invalidOutput: selected.output } : {}),
            validationReasonCodes,
            repairAttemptNumber: 1,
        }));
        attemptCount = 2;
        const repairTerminal = terminalAttemptResult(repaired, attemptCount);
        if (repairTerminal) {
            return finalizeWithTrace(input, repairTerminal, traceEvidence(attemptCount, observedValidationCodes));
        }
        selected = repaired;
        validation =
            repaired.status === "completed"
                ? validateLlmCapabilitySelectionDecision(repaired.output)
                : {
                    valid: false,
                    reasonCodes: [repaired.reasonCode],
                };
        if (validation.valid === false) {
            observedValidationCodes.push(...validation.reasonCodes);
        }
    }
    if (validation.valid === false) {
        return finalizeWithTrace(input, invalidOutputResult(validation.reasonCodes, attemptCount), traceEvidence(attemptCount, observedValidationCodes));
    }
    if (selected.status !== "completed") {
        return finalizeWithTrace(input, invalidOutputResult(["json_object_required"], attemptCount), traceEvidence(attemptCount, observedValidationCodes));
    }
    const decision = validation.decision;
    const admission = admitLlmCapabilitySelection({
        runId: input.runId,
        userMethodSpecified: input.userMethodSpecified,
        externalTransferAllowed: input.externalTransferAllowed,
        maxCost: input.maxCost,
        failedStrategyFingerprints: input.selectionContext.failedStrategyFingerprints,
        capabilitySnapshot: input.capabilitySnapshot,
        decision,
        receipt: createLlmCapabilitySelectionReceipt({
            receiptId: input.receiptId,
            decision,
        }),
    });
    const strategyFingerprints = [
        ...new Set(decision.bindingAssessments
            .map((assessment) => assessment.strategyFingerprint.trim())
            .filter((fingerprint) => SAFE_STRATEGY_FINGERPRINT.test(fingerprint))),
    ].sort();
    return finalizeWithTrace(input, admission, {
        ...traceEvidence(attemptCount, observedValidationCodes),
        admissionReasonCodes: admission.status === "rejected" ? admission.reasonCodes : [],
        strategyFingerprints,
    });
}
const SAFE_STRATEGY_FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
function traceEvidence(attemptCount, validationReasonCodes = []) {
    return {
        attemptCount,
        attemptKinds: attemptCount === 0 ? [] : attemptCount === 1 ? ["initial"] : ["initial", "repair"],
        validationReasonCodes: [...new Set(validationReasonCodes)],
        admissionReasonCodes: [],
        strategyFingerprints: [],
    };
}
function finalizeWithTrace(input, result, evidence) {
    const resultWithRecoveryEvidence = result.status === "rejected" && evidence.strategyFingerprints.length > 0
        ? {
            ...result,
            strategyFingerprints: [...evidence.strategyFingerprints],
        }
        : result;
    if (!input.traceSink)
        return resultWithRecoveryEvidence;
    const failureReasonCode = "reasonCode" in result ? result.reasonCode : undefined;
    if (failureReasonCode === "capability_selection_trace_failed") {
        return resultWithRecoveryEvidence;
    }
    const terminalStatus = result.status === "allowed" ||
        result.status === "approval_required" ||
        result.status === "rejected" ||
        result.status === "failed" ||
        result.status === "cancelled"
        ? result.status
        : "failed";
    const reasonCode = result.status === "allowed"
        ? "capability_selection_allowed"
        : result.status === "approval_required"
            ? "capability_selection_approval_required"
            : result.status === "rejected"
                ? "capability_selection_rejected"
                : failureReasonCode
                    ? failureReasonCode
                    : "capability_selection_provider_failed";
    const stored = input.traceSink.record({
        runId: input.runId,
        decisionReceiptId: input.receiptId,
        reasonCode,
        detail: {
            terminalStatus,
            ...evidence,
        },
    });
    return stored.status === "stored"
        ? {
            ...resultWithRecoveryEvidence,
            decisionTraceId: stored.traceId,
        }
        : {
            status: "failed",
            reasonCode: "capability_selection_trace_failed",
            attemptCount: evidence.attemptCount,
        };
}
async function safeAttempt(attempt) {
    try {
        return await attempt();
    }
    catch {
        return { status: "failed", reasonCode: "provider_failed" };
    }
}
function terminalAttemptResult(result, attemptCount) {
    if (result.status === "cancelled") {
        return {
            status: "cancelled",
            reasonCode: "capability_selection_cancelled",
            attemptCount,
        };
    }
    if (result.status !== "failed")
        return null;
    const reasonCode = {
        provider_failed: "capability_selection_provider_failed",
        timed_out: "capability_selection_timed_out",
        output_limit_exceeded: "capability_selection_output_limit_exceeded",
    }[result.reasonCode];
    return { status: "failed", reasonCode, attemptCount };
}
function invalidOutputResult(validationReasonCodes, attemptCount) {
    return {
        status: "failed",
        reasonCode: "capability_selection_invalid_output",
        validationReasonCodes,
        attemptCount,
    };
}
//# sourceMappingURL=capability-selection-use-case.js.map