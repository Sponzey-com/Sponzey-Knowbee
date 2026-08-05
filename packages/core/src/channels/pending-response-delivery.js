export function createStartedChannelRecoveryRuntime(input) {
    const resolveDeliveryHandler = (resolution) => {
        const deliveryInput = {
            runId: resolution.runId,
            sessionId: resolution.sessionId,
            ...(resolution.language ? { language: resolution.language } : {}),
        };
        if (resolution.source === "telegram") {
            return input.telegram?.createPendingResponseDeliveryHandler(deliveryInput);
        }
        if (resolution.source === "slack") {
            return input.slack?.createPendingResponseDeliveryHandler(deliveryInput);
        }
        return undefined;
    };
    return Object.freeze({
        resolveDeliveryHandler,
        resumeExistingRootRun: input.resumeExistingRootRun
            ?? (async () => false),
    });
}
//# sourceMappingURL=pending-response-delivery.js.map