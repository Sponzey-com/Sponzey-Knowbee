function releaseReadinessFor(status) {
    if (status === "success")
        return "passed";
    if (status === "failure")
        return "failed";
    return "blocked";
}
function terminalResult(status, reasonCode, evidence) {
    return {
        verificationStatus: status,
        smokeStatus: evidence?.smokeStatus ?? "skipped",
        ...(evidence?.observation
            ? {
                observedRequestOutcome: evidence.observation.requestOutcome,
                evidenceMode: evidence.observation.evidenceMode,
            }
            : {}),
        releaseReadiness: releaseReadinessFor(status),
        reasonCode,
    };
}
function propagateProbeResult(result) {
    return terminalResult(result.status, result.reasonCode);
}
function validateObservationBinding(observation, startedBinding) {
    if (observation.binding.runId !== startedBinding.runId
        || observation.binding.requestGroupId !== startedBinding.requestGroupId
        || observation.binding.sessionId !== startedBinding.sessionId) {
        return "observed_run_binding_mismatch";
    }
    if (observation.binding.runId !== observation.binding.requestGroupId) {
        return "request_group_binding_mismatch";
    }
    return undefined;
}
function validateObservation(input, observation, startedBinding) {
    if (observation.smokeStatus !== "passed")
        return "smoke_not_passed";
    const bindingFailure = validateObservationBinding(observation, startedBinding);
    if (bindingFailure)
        return bindingFailure;
    if (!observation.receipts.requestDiagnosisReceiptId.trim()) {
        return "request_diagnosis_receipt_missing";
    }
    if (!observation.receipts.solutionPlanReceiptId.trim()) {
        return "solution_plan_receipt_missing";
    }
    if (input.requiresDistinctDecisionReceipts === true
        && observation.receipts.requestDiagnosisReceiptId
            === observation.receipts.solutionPlanReceiptId) {
        return "decision_receipts_not_distinct";
    }
    if (input.requiresCapabilityAdmission === true &&
        !observation.receipts.capabilityAdmissionReceiptId?.trim()) {
        return "capability_admission_receipt_missing";
    }
    if (!observation.receipts.resultReviewReceiptId.trim()) {
        return "result_review_receipt_missing";
    }
    if (!observation.receipts.finalResponseReceiptId.trim()) {
        return "final_response_receipt_missing";
    }
    if (!observation.receipts.decisionReceiptOrderValid) {
        return "decision_receipt_order_invalid";
    }
    if (!observation.finalization.rootOwnerFinalized)
        return "root_finalization_missing";
    if (observation.finalization.finalAnswerCount !== 1) {
        return "final_answer_count_invalid";
    }
    if (observation.deliveryTarget.channel !== input.channel) {
        return "delivery_channel_mismatch";
    }
    if (observation.deliveryTarget.targetRef !== input.expectedTargetRef) {
        return "delivery_target_mismatch";
    }
    if (observation.requestOutcome.executionStatus !== input.expectedExecutionStatus) {
        return "execution_outcome_mismatch";
    }
    if (input.userReportExpected && observation.requestOutcome.deliveryStatus !== "delivered") {
        return "request_outcome_delivery_missing";
    }
    return undefined;
}
export class VerifyConversationProcessUseCase {
    ports;
    options;
    constructor(ports, options = {}) {
        this.ports = ports;
        this.options = options;
    }
    async execute(input, signal) {
        const started = await this.ports.probe.start(input, signal);
        if (started.status !== "success")
            return propagateProbeResult(started);
        let fixtureInteractionIndex = 0;
        let observation;
        while (true) {
            const observed = await this.ports.probe.observe(started.value, signal);
            if (observed.status !== "success")
                return propagateProbeResult(observed);
            observation = observed.value;
            const bindingFailure = validateObservationBinding(observation, started.value);
            if (bindingFailure) {
                return terminalResult("failure", bindingFailure, {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            if (observation.requestOutcome.executionStatus === "cancelled") {
                return terminalResult("cancelled", "request_cancelled", {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            if (observation.requestOutcome.executionStatus === "awaiting_user") {
                return terminalResult("additional_input_required", "request_input_required", {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            if (observation.requestOutcome.executionStatus === "awaiting_approval") {
                const interaction = this.options.fixtureInteractions?.[fixtureInteractionIndex];
                if (observation.evidenceMode !== "fixture" || !interaction) {
                    return terminalResult("additional_input_required", "request_input_required", {
                        smokeStatus: observation.smokeStatus,
                        observation,
                    });
                }
                const pending = observation.pendingInteraction;
                if (!pending?.approvalRequestRef.trim()) {
                    return terminalResult("failure", "pending_approval_ref_missing", {
                        smokeStatus: observation.smokeStatus,
                        observation,
                    });
                }
                if (interaction.kind !== "approval_decision"
                    || !["allow_once", "allow_run", "deny"].includes(interaction.decision)) {
                    return terminalResult("failure", "approval_interaction_invalid", {
                        smokeStatus: observation.smokeStatus,
                        observation,
                    });
                }
                if (interaction.approvalRequestRef !== pending.approvalRequestRef) {
                    return terminalResult("failure", "approval_interaction_ref_mismatch", {
                        smokeStatus: observation.smokeStatus,
                        observation,
                    });
                }
                const controlled = await this.ports.control.interact(observation.binding, interaction, signal);
                if (controlled.status !== "success") {
                    return terminalResult(controlled.status, controlled.reasonCode, {
                        smokeStatus: observation.smokeStatus,
                        observation,
                    });
                }
                fixtureInteractionIndex += 1;
                continue;
            }
            if (observation.requestOutcome.executionStatus === "blocked") {
                return terminalResult("blocked", "request_blocked", {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            break;
        }
        if (observation.evidenceMode === "fixture"
            && fixtureInteractionIndex !== (this.options.fixtureInteractions?.length ?? 0)) {
            return terminalResult("failure", "fixture_interaction_unused", {
                smokeStatus: observation.smokeStatus,
                observation,
            });
        }
        const validationFailure = validateObservation(input, observation, started.value);
        if (validationFailure) {
            return terminalResult("failure", validationFailure, {
                smokeStatus: observation.smokeStatus,
                observation,
            });
        }
        let deliveryReceiptRef;
        if (input.userReportExpected) {
            const delivery = await this.ports.delivery.verifyDelivery({
                binding: observation.binding,
                expectedChannel: input.channel,
                expectedTargetRef: input.expectedTargetRef,
            }, signal);
            if (delivery.status !== "success") {
                return terminalResult(delivery.status, delivery.reasonCode, {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            if (!delivery.value.delivered
                || delivery.value.channel !== input.channel
                || delivery.value.targetRef !== input.expectedTargetRef
                || !delivery.value.receiptRef.trim()) {
                return terminalResult("failure", "visible_delivery_missing", {
                    smokeStatus: observation.smokeStatus,
                    observation,
                });
            }
            deliveryReceiptRef = delivery.value.receiptRef;
        }
        return {
            verificationStatus: "success",
            smokeStatus: observation.smokeStatus,
            observedRequestOutcome: observation.requestOutcome,
            releaseReadiness: "passed",
            evidenceMode: observation.evidenceMode,
            ...(deliveryReceiptRef ? { deliveryReceiptRef } : {}),
        };
    }
}
//# sourceMappingURL=conversation-process-verification.js.map