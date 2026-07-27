export type CapabilityMutationState = "draft" | "validating" | "ready" | "persisting" | "applying" | "verifying" | "active" | "failed" | "rolling_back" | "rolled_back" | "cancelled";
export interface CapabilityMutation {
    mutationId: string;
    state: CapabilityMutationState;
    baseRevision: number;
    targetRevision: number;
    reasonCode: string | null;
    rollbackAllowed?: boolean;
}
export type CapabilityMutationEvent = {
    type: "validate";
} | {
    type: "validation_passed";
} | {
    type: "validation_failed";
    reasonCode: string;
} | {
    type: "persist";
    expectedRevision: number;
    actualRevision: number;
} | {
    type: "persisted";
} | {
    type: "persist_failed";
    reasonCode: string;
} | {
    type: "applied";
} | {
    type: "apply_failed";
    reasonCode: string;
} | {
    type: "verified";
} | {
    type: "verification_failed";
    reasonCode: string;
} | {
    type: "rollback";
} | {
    type: "rollback_succeeded";
} | {
    type: "rollback_failed";
    reasonCode: string;
} | {
    type: "cancel";
};
export declare function transitionCapabilityMutation(current: CapabilityMutation, event: CapabilityMutationEvent): CapabilityMutation;
export declare function projectCapabilityMutationReceipt(mutation: CapabilityMutation): {
    mutationId: string;
    targetRevision: number;
    state: CapabilityMutationState;
    reasonCode: string | null;
    allowedActions: readonly string[];
};
export interface CapabilityMutationPorts {
    validate(signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    persist(expectedRevision: number, signal: AbortSignal): Promise<{
        ok?: boolean;
        revision: number;
        reasonCode?: string;
    }>;
    apply(targetRevision: number, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    verify(targetRevision: number, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
    rollback(baseRevision: number, signal: AbortSignal): Promise<{
        ok: boolean;
        reasonCode?: string;
    }>;
}
export declare function executeCapabilityMutation(initial: CapabilityMutation, ports: CapabilityMutationPorts, signal?: AbortSignal): Promise<CapabilityMutation>;
export type CapabilityLogLevel = "product" | "field_debug" | "development";
export declare function projectCapabilityMutationLog(level: CapabilityLogLevel, mutation: CapabilityMutation): Record<string, unknown>;
//# sourceMappingURL=capability-mutation-state-machine.d.ts.map