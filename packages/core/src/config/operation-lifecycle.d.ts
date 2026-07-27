export type ConfigurationOperationState = "received" | "validated" | "executing" | "persisted" | "backed_up" | "replacing" | "verifying" | "rolling_back" | "completed" | "failed" | "rejected";
export interface ConfigurationOperationTransition {
    readonly from: ConfigurationOperationState | null;
    readonly to: ConfigurationOperationState;
    readonly reasonCode: string;
    readonly timestamp: number;
}
export interface ConfigurationOperationSnapshot {
    readonly commandId: string;
    readonly kind: string;
    readonly state: ConfigurationOperationState;
    readonly transitions: readonly ConfigurationOperationTransition[];
}
export declare function createConfigurationOperationLifecycle(options: {
    kind: string;
    commandId?: string;
    now?: () => number;
}): {
    transition(next: ConfigurationOperationState, reasonCode: string): void;
    snapshot(): ConfigurationOperationSnapshot;
};
export type ConfigurationOperationLifecycle = ReturnType<typeof createConfigurationOperationLifecycle>;
//# sourceMappingURL=operation-lifecycle.d.ts.map