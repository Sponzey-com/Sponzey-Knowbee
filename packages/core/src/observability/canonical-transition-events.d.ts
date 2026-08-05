import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js";
import { type TypedObservabilityEvent } from "./typed-event-contract.js";
import { type RecordTypedObservabilityEventReceipt, type TypedObservabilityEventRepository } from "./typed-event-repository.js";
export interface CanonicalTransitionObservabilityContext {
    requestId: string;
    requestGroupId: string;
    rootRunId: string;
    runId: string;
    parentRunId?: string | undefined;
    at: number;
}
export declare function recordCanonicalRequestReceivedObservability(input: {
    repository: TypedObservabilityEventRepository;
    context: CanonicalTransitionObservabilityContext;
    workId: string;
    onDegraded?: ((error: unknown) => void) | undefined;
}): RecordTypedObservabilityEventReceipt | {
    status: "rejected";
    reasonCode: string;
};
export declare function buildCanonicalTransitionObservabilityEvent(input: {
    aggregate: CanonicalWorkAggregate;
    context: CanonicalTransitionObservabilityContext;
}): {
    status: "ready";
    event: TypedObservabilityEvent;
} | {
    status: "skipped";
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function recordCanonicalTransitionObservability(input: {
    repository: TypedObservabilityEventRepository;
    aggregate: CanonicalWorkAggregate;
    context: CanonicalTransitionObservabilityContext;
    onDegraded?: ((error: unknown) => void) | undefined;
}): RecordTypedObservabilityEventReceipt | {
    status: "skipped";
} | {
    status: "rejected";
    reasonCode: string;
};
//# sourceMappingURL=canonical-transition-events.d.ts.map