export function validateConversationDeliveryParity(observations) {
    const failures = [];
    const scenarioIds = [...new Set(observations.map((item) => item.scenarioId))];
    for (const scenarioId of scenarioIds) {
        const paired = new Map();
        for (const channel of ["webui", "telegram"]) {
            const candidates = observations.filter((item) => item.scenarioId === scenarioId && item.channel === channel);
            if (candidates.length !== 1) {
                failures.push(candidates.length === 0
                    ? `delivery_observation_missing:${channel}:${scenarioId}`
                    : `delivery_observation_duplicate:${channel}:${scenarioId}`);
                continue;
            }
            const observation = candidates[0];
            paired.set(channel, observation);
            if (!observation.reviewedFinalAnswer) {
                failures.push(`reviewed_final_answer_missing:${channel}:${scenarioId}`);
            }
            if (observation.finalAnswerCount !== 1) {
                failures.push(`final_answer_count_invalid:${channel}:${scenarioId}`);
            }
            if (!observation.targetBound) {
                failures.push(`delivery_target_unbound:${channel}:${scenarioId}`);
            }
            if (observation.terminalState === "delivered"
                && !observation.deliveryReceiptPresent) {
                failures.push(`delivery_receipt_missing:${channel}:${scenarioId}`);
            }
            if (observation.artifactCount > 0 && !observation.artifactBeforeFinal) {
                failures.push(`artifact_order_invalid:${channel}:${scenarioId}`);
            }
            if (!observation.duplicateSuppressed) {
                failures.push(`duplicate_delivery_unsuppressed:${channel}:${scenarioId}`);
            }
            if (!observation.publicProjectionSafe) {
                failures.push(`public_projection_unsafe:${channel}:${scenarioId}`);
            }
        }
        const webui = paired.get("webui");
        const telegram = paired.get("telegram");
        if (webui && telegram && webui.terminalState !== telegram.terminalState) {
            failures.push(`delivery_outcome_mismatch:${scenarioId}`);
        }
    }
    return {
        status: failures.length === 0 ? "passed" : "failed",
        failures,
    };
}
//# sourceMappingURL=conversation-delivery-parity.js.map