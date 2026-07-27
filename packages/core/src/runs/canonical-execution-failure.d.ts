export type CanonicalExecutionFailurePhase = "intake" | "policy" | "execution" | "review" | "recovery" | "topology";
export interface CanonicalExecutionFailureInput {
    phase: CanonicalExecutionFailurePhase;
    reasonCode: string;
    retryable: boolean;
    message?: string;
}
export declare class CanonicalExecutionFailure extends Error {
    readonly kind = "knowbee.canonical_execution_failure.v1";
    readonly phase: CanonicalExecutionFailurePhase;
    readonly reasonCode: string;
    readonly retryable: boolean;
    constructor(input: CanonicalExecutionFailureInput);
}
export declare function isCanonicalExecutionFailure(failure: unknown): failure is CanonicalExecutionFailure;
//# sourceMappingURL=canonical-execution-failure.d.ts.map