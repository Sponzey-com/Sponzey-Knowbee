const REQUIRED_CHANNELS = ["webui", "telegram"];
export function validateConversationControlRecoveryParity(observations) {
    const failures = [];
    const scenarioIds = [...new Set(observations.map((item) => item.scenarioId))];
    for (const scenarioId of scenarioIds) {
        const paired = new Map();
        for (const channel of REQUIRED_CHANNELS) {
            const candidates = observations.filter((item) => item.scenarioId === scenarioId && item.channel === channel);
            if (candidates.length !== 1) {
                failures.push(candidates.length === 0
                    ? `control_observation_missing:${channel}:${scenarioId}`
                    : `control_observation_duplicate:${channel}:${scenarioId}`);
                continue;
            }
            const observation = candidates[0];
            paired.set(channel, observation);
            const expectedTransitionCount = observation.interactionAdmission === "accepted" ? 1 : 0;
            if (observation.transitionCount !== expectedTransitionCount) {
                failures.push(`control_transition_count_invalid:${channel}:${scenarioId}`);
            }
            if (observation.sideEffectCountAfterTerminal !== 0) {
                failures.push(`post_terminal_side_effect:${channel}:${scenarioId}`);
            }
            if (observation.retry.attempted) {
                const previous = observation.retry.previousStrategyFingerprint?.trim();
                const next = observation.retry.nextStrategyFingerprint?.trim();
                if (!previous || !next || previous === next) {
                    failures.push(`retry_strategy_unchanged:${channel}:${scenarioId}`);
                }
            }
            if (observation.restartDelivery.attempted
                && !observation.restartDelivery.admissionReceiptPresent) {
                failures.push(`restart_delivery_without_admission:${channel}:${scenarioId}`);
            }
        }
        const webui = paired.get("webui");
        const telegram = paired.get("telegram");
        if (!webui || !telegram)
            continue;
        if (webui.interactionAdmission !== telegram.interactionAdmission) {
            failures.push(`control_outcome_mismatch:${scenarioId}:admission`);
        }
        if (webui.executionStatus !== telegram.executionStatus) {
            failures.push(`control_outcome_mismatch:${scenarioId}:execution`);
        }
        if (webui.deliveryStatus !== telegram.deliveryStatus) {
            failures.push(`control_outcome_mismatch:${scenarioId}:delivery`);
        }
    }
    return {
        status: failures.length === 0 ? "passed" : "failed",
        failures,
    };
}
//# sourceMappingURL=conversation-control-recovery.js.map