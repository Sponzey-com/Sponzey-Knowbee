export type ConfigurationCommandState = "received" | "validated" | "persisted" | "runtime_applying" | "runtime_applied" | "runtime_failed" | "rolled_back" | "restart_required" | "rejected" | "completed";
export interface ConfigurationCommandTransition {
    from: ConfigurationCommandState | null;
    to: ConfigurationCommandState;
    reasonCode: string;
    timestamp: number;
}
export interface ConfigurationCommandSnapshot {
    commandId: string;
    kind: string;
    state: ConfigurationCommandState;
    transitions: ConfigurationCommandTransition[];
}
export declare function createConfigurationCommandStateMachine(options: {
    kind: string;
    commandId?: string;
    now?: () => number;
}): {
    transition(next: ConfigurationCommandState, reasonCode: string): void;
    snapshot(): ConfigurationCommandSnapshot;
};
export declare function buildPersistedConfigurationCommand(kind: string): ConfigurationCommandSnapshot;
export declare function buildRuntimeAppliedConfigurationCommand(kind: string): ConfigurationCommandSnapshot;
export declare function buildPersistedRuntimeAppliedConfigurationCommand(kind: string): ConfigurationCommandSnapshot;
export declare function buildRuntimeFailedConfigurationCommand(kind: string, reasonCode: string): ConfigurationCommandSnapshot;
export declare function buildRejectedConfigurationCommand(kind: string, reasonCode: string): ConfigurationCommandSnapshot;
//# sourceMappingURL=command-state.d.ts.map