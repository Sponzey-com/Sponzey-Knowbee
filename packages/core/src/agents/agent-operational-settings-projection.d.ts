export type AgentOperationalSettingsStatus = "enabled" | "disabled" | "archived" | "degraded";
export type AgentOperationalRiskLevel = "safe" | "moderate" | "external" | "sensitive" | "dangerous";
export interface AgentOperationalSettingsProjection {
    agentRef: string;
    status: AgentOperationalSettingsStatus;
    revision: number;
    model: {
        configured: boolean;
        availability: "configured" | "unavailable";
        providerName?: string;
        modelName?: string;
        effort?: string;
        fallbackModelName?: string;
    };
    memory: {
        retentionPolicy: "session" | "short_term" | "long_term";
        capsuleMode: "session_compaction" | "rolling_summary";
        rawWindowSize: number | null;
        compactThreshold: number | null;
        writebackReviewRequired: boolean;
        lastCompactedAt: number | null;
        capsuleCount: number;
    };
    permission: {
        riskCeiling: AgentOperationalRiskLevel;
        approvalRequiredFrom: AgentOperationalRiskLevel;
        allowExternalNetwork: boolean;
        allowFilesystemWrite: boolean;
        allowShellExecution: boolean;
        allowScreenControl: boolean;
        allowedPathCount: number;
    };
    diagnosticCodes: string[];
    observedAt: number;
}
export interface AgentOperationalSettingsProjectionSource {
    agentRef: string;
    status: unknown;
    profileVersion: number;
    modelProfile?: unknown;
    memoryPolicy: unknown;
    permissionProfile: unknown;
    observedAt: number;
}
export declare function buildAgentOperationalSettingsProjection(source: AgentOperationalSettingsProjectionSource): AgentOperationalSettingsProjection;
//# sourceMappingURL=agent-operational-settings-projection.d.ts.map