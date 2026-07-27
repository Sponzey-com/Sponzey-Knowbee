import { type CapabilityMutationState } from "../capabilities/capability-mutation-state-machine.js";
import { type MutationEnvelope } from "../capabilities/capability-security-boundary.js";
import type { CapabilityRiskLevel, MemoryPolicy, ModelProfile, PermissionProfile } from "../contracts/sub-agent-orchestration.js";
export type AgentOperationalSettingsMutationKind = "update_model" | "clear_model" | "update_memory" | "update_permission";
export declare const AGENT_OPERATIONAL_SETTINGS_WRITE_OWNER: "agent_operational_settings_command_v1";
export type AgentOperationalSettingsCommand = {
    kind: "update_model";
    agentRef: string;
    envelope: MutationEnvelope;
    value: {
        providerName: string;
        modelName: string;
        effort?: string;
        fallbackModelName?: string;
    };
} | {
    kind: "clear_model";
    agentRef: string;
    envelope: MutationEnvelope;
} | {
    kind: "update_memory";
    agentRef: string;
    envelope: MutationEnvelope;
    value: {
        retentionPolicy: MemoryPolicy["retentionPolicy"];
        capsuleMode: NonNullable<MemoryPolicy["capsuleMode"]>;
        rawWindowSize: number;
        compactThreshold: number;
        writebackReviewRequired: boolean;
    };
} | {
    kind: "update_permission";
    agentRef: string;
    envelope: MutationEnvelope;
    value: {
        riskCeiling: CapabilityRiskLevel;
        approvalRequiredFrom: CapabilityRiskLevel;
        allowExternalNetwork: boolean;
        allowFilesystemWrite: boolean;
        allowShellExecution: boolean;
        allowScreenControl: boolean;
    };
};
export interface AgentOperationalSettingsState {
    internalAgentId: string;
    active: boolean;
    root: boolean;
    revision: number;
    modelProfile?: ModelProfile;
    memoryPolicy: MemoryPolicy;
    permissionProfile: PermissionProfile;
}
export interface AgentOperationalSettingsMutationReceipt {
    mutationId: string;
    kind: AgentOperationalSettingsMutationKind;
    state: CapabilityMutationState | "rejected" | "conflict";
    reasonCode: string | null;
    revision: number;
    agentRef: string;
    allowedActions: readonly string[];
}
export type AgentOperationalSettingsLogLevel = "product" | "field_debug" | "development";
export declare function projectAgentOperationalSettingsMutationLog(level: AgentOperationalSettingsLogLevel, receipt: AgentOperationalSettingsMutationReceipt): Record<string, unknown>;
export interface AgentOperationalSettingsCommandPorts {
    now(): number;
    receiptByNonce(nonce: string): {
        mutationId: string;
        requestFingerprint: string;
        receipt: AgentOperationalSettingsMutationReceipt;
    } | null;
    reserveReceipt(input: {
        envelope: MutationEnvelope;
        kind: AgentOperationalSettingsMutationKind;
        requestFingerprint: string;
        state: CapabilityMutationState;
        now: number;
    }): boolean;
    finishReceipt(input: {
        mutationId: string;
        state: CapabilityMutationState;
        reasonCode: string | null;
        receipt: AgentOperationalSettingsMutationReceipt;
        now: number;
    }): void;
    current(agentRef: string): AgentOperationalSettingsState | null;
    persist(input: {
        current: AgentOperationalSettingsState;
        next: AgentOperationalSettingsState;
        expectedRevision: number;
        targetRevision: number;
    }): {
        ok: boolean;
        revision: number;
        reasonCode?: string;
    };
    verify(input: {
        internalAgentId: string;
        expected: AgentOperationalSettingsState;
        targetRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
    rollback(input: {
        previous: AgentOperationalSettingsState;
        failedRevision: number;
    }): {
        ok: boolean;
        reasonCode?: string;
    };
}
export declare function executeAgentOperationalSettingsCommand(command: AgentOperationalSettingsCommand, ports: AgentOperationalSettingsCommandPorts): Promise<AgentOperationalSettingsMutationReceipt>;
//# sourceMappingURL=agent-operational-settings-command.d.ts.map