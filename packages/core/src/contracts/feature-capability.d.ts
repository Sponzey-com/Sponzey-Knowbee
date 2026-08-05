export type CapabilityStatus = "ready" | "disabled" | "planned" | "error";
export type CapabilityArea = "setup" | "gateway" | "runs" | "chat" | "ai" | "security" | "telegram" | "slack" | "scheduler" | "plugins" | "memory" | "mcp" | "mqtt";
export interface FeatureCapability {
    key: string;
    label: string;
    area: CapabilityArea;
    status: CapabilityStatus;
    implemented: boolean;
    enabled: boolean;
    reason?: string;
    reasonCode?: string;
    dependsOn?: string[];
    metadata?: Record<string, unknown>;
}
export interface CapabilityCounts {
    ready: number;
    disabled: number;
    planned: number;
    error: number;
}
//# sourceMappingURL=feature-capability.d.ts.map