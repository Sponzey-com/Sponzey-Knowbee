export function writeTypedObservabilityLog(logger, event) {
    const message = `${event.kind}: ${event.summary}`;
    const boundedContext = {
        eventId: event.eventId,
        reasonCode: event.reasonCode,
        correlation: event.correlation,
        ...(event.attributes ? { attributes: event.attributes } : {}),
    };
    if (event.purpose === "product")
        logger.product(message, boundedContext);
    else if (event.purpose === "field_debug")
        logger.fieldDebug(message, boundedContext);
    else
        logger.development(message, boundedContext);
    return { eventId: event.eventId, purpose: event.purpose, written: true };
}
//# sourceMappingURL=typed-event-logger.js.map