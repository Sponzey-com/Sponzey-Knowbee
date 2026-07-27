import { buildTypedObservabilityEvent, } from "./typed-event-contract.js";
export function recordTypedObservabilityEventSafely(input) {
    const validation = buildTypedObservabilityEvent(input.event);
    if (validation.status === "rejected")
        return validation;
    try {
        return input.repository.append(validation.event);
    }
    catch (error) {
        input.onDegraded?.(error);
        return { status: "degraded", reasonCode: "repository_write_failed" };
    }
}
//# sourceMappingURL=typed-event-repository.js.map