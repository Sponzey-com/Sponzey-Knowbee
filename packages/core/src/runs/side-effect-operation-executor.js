import { validateSideEffectOperationAuthorization, } from "../contracts/side-effect-operation.js";
import { reserveSideEffectOperation, transitionReservedSideEffectOperation, } from "./side-effect-operation-use-case.js";
import { decideResumedSideEffectVerification, decideSideEffectRemediation, decideSideEffectVerification, } from "./side-effect-verification.js";
export async function executeSideEffectOperation(input, dependencies) {
    const authorization = validateSideEffectOperationAuthorization({
        identity: input.identity,
        authorization: dependencies.authorization,
    });
    if (!authorization.authorized) {
        return { status: "blocked", reasonCode: authorization.reasonCode };
    }
    const reserved = reserveSideEffectOperation({
        repository: dependencies.repository,
        identity: input.identity,
    });
    if (reserved.status === "rejected")
        return { status: "blocked", reasonCode: reserved.reasonCode };
    let aggregate = reserved.aggregate;
    if (aggregate.state === "VERIFIED")
        return { status: "duplicate_verified", aggregate };
    if (aggregate.state === "EFFECT_REJECTED") {
        return {
            status: "effect_rejected",
            reasonCode: "side_effect_existing_effect_rejected",
            aggregate,
        };
    }
    if (aggregate.state === "MANUAL_INTERVENTION") {
        const priorReceiptRef = [...aggregate.transitions]
            .reverse()
            .find((item) => item.event === "MARK_MANUAL" || item.event === "COMPENSATION_FAILED")
            ?.receiptRef;
        return {
            status: "manual_intervention",
            reasonCode: "side_effect_existing_manual_intervention",
            aggregate,
            ...(priorReceiptRef ? { priorReceiptRef } : {}),
        };
    }
    const transition = (event, evidence) => {
        const receipt = dependencies.createReceipt({
            identity: aggregate.identity,
            event,
            operationRevision: aggregate.revision + 1,
            evidence,
        });
        const result = transitionReservedSideEffectOperation({
            repository: dependencies.repository,
            operationId: aggregate.identity.operationId,
            scopeId: aggregate.identity.scopeId,
            expectedRevision: aggregate.revision,
            event,
            receipt,
        });
        if (result.status === "applied")
            aggregate = result.aggregate;
        return result;
    };
    if (aggregate.state === "EFFECT_RECORDED" ||
        aggregate.state === "VERIFYING" ||
        aggregate.state === "CANCEL_REQUESTED") {
        if (!input.observeCurrentPostState) {
            return { status: "blocked", reasonCode: "side_effect_resume_observer_missing", aggregate };
        }
        const effectReceiptRef = [...aggregate.transitions]
            .reverse()
            .find((item) => item.event === "RECORD_EFFECT")?.receiptRef;
        if (!effectReceiptRef) {
            return { status: "blocked", reasonCode: "side_effect_record_receipt_missing", aggregate };
        }
        const persistedEffectReceipt = dependencies.repository.loadReceipt(effectReceiptRef);
        if (!persistedEffectReceipt ||
            persistedEffectReceipt.operationId !== aggregate.identity.operationId ||
            persistedEffectReceipt.event !== "RECORD_EFFECT" ||
            persistedEffectReceipt.kind !== "effect") {
            return { status: "blocked", reasonCode: "side_effect_record_receipt_invalid", aggregate };
        }
        if (aggregate.state !== "VERIFYING") {
            const resumedFrom = aggregate.state;
            const started = transition("BEGIN_VERIFICATION", { resumedFrom });
            if (started.status !== "applied") {
                return { status: "blocked", reasonCode: started.reasonCode, aggregate };
            }
        }
        const observation = await input.observeCurrentPostState({
            effectEvidenceRefs: persistedEffectReceipt.evidenceRefs,
        });
        const decision = decideResumedSideEffectVerification({
            targetFingerprint: input.identity.targetFingerprint,
            authorizedExpectedStateFingerprint: authorization.authorization.expectedEffectFingerprint,
            effectReceiptRef,
            observation: {
                ...observation,
                receiptRef: `observation-evidence:${observation.observedStateFingerprint}`,
            },
        });
        if (decision.verified) {
            const verified = transition("VERIFICATION_PASSED", {
                resumed: true,
                receiptRefs: decision.receiptRefs,
            });
            return verified.status === "applied"
                ? { status: "resumed_verified", aggregate }
                : { status: "blocked", reasonCode: verified.reasonCode, aggregate };
        }
        const failed = transition("VERIFICATION_FAILED", {
            resumed: true,
            reasonCode: decision.reasonCode,
        });
        if (failed.status !== "applied") {
            return { status: "blocked", reasonCode: failed.reasonCode, aggregate };
        }
        const manual = transition("MARK_MANUAL", {
            reasonCode: "side_effect_resume_verification_failed",
        });
        return manual.status === "applied"
            ? {
                status: "manual_intervention",
                reasonCode: "side_effect_resume_verification_failed",
                aggregate,
                ...(observation.recoveryEvidence !== undefined
                    ? { recoveryEvidence: observation.recoveryEvidence }
                    : {}),
            }
            : { status: "blocked", reasonCode: manual.reasonCode, aggregate };
    }
    if (aggregate.state !== "RESERVED") {
        return {
            status: "blocked",
            reasonCode: `side_effect_operation_not_resumable:${aggregate.state}`,
            aggregate,
        };
    }
    if (dependencies.isCancelled()) {
        const cancelled = transition("REQUEST_CANCEL");
        return cancelled.status === "applied"
            ? { status: "cancelled_before_effect", aggregate }
            : { status: "blocked", reasonCode: cancelled.reasonCode, aggregate };
    }
    const started = transition("START_EFFECT", { authorization: authorization.authorization });
    if (started.status !== "applied")
        return { status: "blocked", reasonCode: started.reasonCode, aggregate };
    if (dependencies.isCancelled()) {
        const cancelled = transition("REQUEST_CANCEL", {
            reasonCode: "cancelled_after_start_before_effect",
        });
        return cancelled.status === "applied"
            ? { status: "cancelled_before_effect", aggregate }
            : { status: "blocked", reasonCode: cancelled.reasonCode, aggregate };
    }
    const effect = await input.executeEffect();
    if (effect.preEffectRejection) {
        const rejected = transition("RECORD_REJECTION", {
            reasonCode: effect.preEffectRejection.reasonCode,
            retrySafety: effect.preEffectRejection.retrySafety,
            targetFingerprint: input.identity.targetFingerprint,
            resultFingerprint: effect.resultFingerprint,
            recordedAt: effect.recordedAt,
        });
        return rejected.status === "applied"
            ? {
                status: "effect_rejected",
                reasonCode: effect.preEffectRejection.reasonCode,
                aggregate,
            }
            : { status: "blocked", reasonCode: rejected.reasonCode, aggregate };
    }
    const effectEvidence = {
        success: effect.success,
        targetFingerprint: input.identity.targetFingerprint,
        resultFingerprint: effect.resultFingerprint,
        recordedAt: effect.recordedAt,
        ...(effect.effectEvidenceRefs
            ? { effectEvidenceRefs: [...effect.effectEvidenceRefs] }
            : {}),
    };
    const recorded = transition("RECORD_EFFECT", effectEvidence);
    if (recorded.status !== "applied")
        return { status: "blocked", reasonCode: recorded.reasonCode, aggregate };
    aggregate = recorded.aggregate;
    const effectReceiptRef = aggregate.transitions.at(-1)?.receiptRef;
    if (!effectReceiptRef) {
        return { status: "blocked", reasonCode: "side_effect_record_receipt_missing", aggregate };
    }
    if (dependencies.isCancelled()) {
        const cancellation = transition("REQUEST_CANCEL");
        if (cancellation.status !== "applied") {
            return { status: "blocked", reasonCode: cancellation.reasonCode, aggregate };
        }
    }
    const verificationStarted = transition("BEGIN_VERIFICATION");
    if (verificationStarted.status !== "applied")
        return { status: "blocked", reasonCode: verificationStarted.reasonCode, aggregate };
    const observation = await input.observePostState(effect.value);
    const decision = decideSideEffectVerification({
        effect: {
            success: effect.success,
            targetFingerprint: input.identity.targetFingerprint,
            resultFingerprint: effect.resultFingerprint,
            recordedAt: effect.recordedAt,
            receiptRef: effectReceiptRef,
        },
        observation: {
            ...observation,
            receiptRef: `observation-evidence:${observation.observedStateFingerprint}`,
        },
        authorizedExpectedStateFingerprint: authorization.authorization.expectedEffectFingerprint,
    });
    if (decision.verified) {
        const verified = transition("VERIFICATION_PASSED", { receiptRefs: decision.receiptRefs });
        return verified.status === "applied"
            ? { status: "verified", value: effect.value, aggregate }
            : { status: "blocked", reasonCode: verified.reasonCode, aggregate };
    }
    const failed = transition("VERIFICATION_FAILED", { reasonCode: decision.reasonCode });
    if (failed.status !== "applied")
        return { status: "blocked", reasonCode: failed.reasonCode, aggregate };
    const remediation = decideSideEffectRemediation({
        ...decision,
        compensationSupport: input.compensationSupport,
    });
    if (remediation.action === "manual_intervention" ||
        !input.compensate ||
        !input.verifyCompensation) {
        const manual = transition("MARK_MANUAL", { reasonCode: remediation.reasonCode });
        return manual.status === "applied"
            ? {
                status: "manual_intervention",
                reasonCode: remediation.reasonCode,
                aggregate,
                ...(observation.recoveryEvidence !== undefined
                    ? { recoveryEvidence: observation.recoveryEvidence }
                    : {}),
            }
            : { status: "blocked", reasonCode: manual.reasonCode, aggregate };
    }
    const compensating = transition("BEGIN_COMPENSATION");
    if (compensating.status !== "applied")
        return { status: "blocked", reasonCode: compensating.reasonCode, aggregate };
    const compensation = await input.compensate(effect.value);
    const compensationVerification = compensation.success
        ? await input.verifyCompensation()
        : { verified: false, receiptEvidence: "compensation_execution_failed" };
    const compensationEvent = compensation.success && compensationVerification.verified
        ? "COMPENSATION_SUCCEEDED"
        : "COMPENSATION_FAILED";
    const completed = transition(compensationEvent, {
        compensation: compensation.receiptEvidence,
        verification: compensationVerification.receiptEvidence,
    });
    if (completed.status !== "applied")
        return { status: "blocked", reasonCode: completed.reasonCode, aggregate };
    return compensationEvent === "COMPENSATION_SUCCEEDED"
        ? { status: "compensated", aggregate }
        : { status: "manual_intervention", reasonCode: "side_effect_compensation_failed", aggregate };
}
//# sourceMappingURL=side-effect-operation-executor.js.map