import type { CanonicalExecutionFailure, CanonicalExecutionFailurePhase } from "./canonical-execution-failure.js";
export type ContractFailureClass = "llm_output_repairable" | "capability_degraded" | "policy_waiting" | "persistence_conflict" | "adapter_unavailable" | "invariant_breach";
export type ContractFailureRetryClass = "llm_repair" | "changed_strategy" | "wait" | "reload_state" | "adapter_retry" | "none";
export interface ContractFailure {
    readonly phase: CanonicalExecutionFailurePhase;
    readonly reasonCode: string;
    readonly failureClass: ContractFailureClass;
    readonly retryClass: ContractFailureRetryClass;
    readonly requestId: string;
    readonly workId?: string;
    readonly expectedRevision?: number;
    readonly safeEvidenceRefs: readonly string[];
    readonly auditRef: string;
}
export type ExecutionFailureDirective = {
    kind: "repair";
    retryClass: "llm_repair";
    safeEvidenceRefs: string[];
} | {
    kind: "replan";
    mode: "degraded_capability";
    retryClass: "changed_strategy";
    safeEvidenceRefs: string[];
} | {
    kind: "wait";
    retryClass: "wait";
} | {
    kind: "retry_persistence";
    retryClass: "reload_state";
    expectedRevision: number;
} | {
    kind: "retry_adapter";
    retryClass: "adapter_retry";
} | {
    kind: "internal_fault";
    retryClass: "none";
    auditRef: string;
};
export declare function projectCanonicalContractFailure(input: {
    failure: CanonicalExecutionFailure;
    requestId: string;
    workId?: string;
    expectedRevision?: number;
    safeEvidenceRefs?: readonly string[];
    auditRef: string;
}): ContractFailure;
export declare function resolveExecutionFailure(failure: ContractFailure): ExecutionFailureDirective;
export interface PublicContractFailureProjection {
    status: "retrying" | "waiting" | "blocked";
    action: "repair" | "replan" | "wait" | "retry" | "contact_support";
}
export declare function projectPublicContractFailure(failure: ContractFailure): PublicContractFailureProjection;
export declare function projectAuditContractFailure(failure: ContractFailure): ContractFailure;
export interface ContractFailureRetryDirective {
    kind: "retry_intake";
    summary: string;
    reason: string;
    message: string;
    eventLabel: "canonical_policy_reanalysis_requested";
}
export declare function projectContractFailureRetryDirective(input: {
    failure: ContractFailure;
    originalRequest: string;
}): ContractFailureRetryDirective | null;
//# sourceMappingURL=contract-failure-resolution.d.ts.map