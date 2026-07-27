export type YeonjangNormalizedCapabilityGroup = "applications" | "browser" | "camera" | "clipboard" | "command" | "device" | "disk" | "files" | "input" | "network" | "process" | "screen" | "system" | "unknown";
export type YeonjangCapabilityRiskLevel = "safe" | "moderate" | "dangerous";
export type YeonjangCapabilitySideEffectClass = "delete_local" | "input_control" | "network" | "none" | "process_control" | "read_local" | "screen_read" | "system_control" | "write_local";
export type YeonjangCapabilitySupportState = "limited" | "permission_required" | "supported" | "unknown" | "unsupported";
export type YeonjangCapabilityCompatibilityMode = "legacy_methods_only" | "structured_matrix";
export type YeonjangCapabilityIssueSeverity = "error" | "warning";
export interface YeonjangCapabilityClassification {
    group: YeonjangNormalizedCapabilityGroup;
    riskLevel: YeonjangCapabilityRiskLevel;
    sideEffectClass: YeonjangCapabilitySideEffectClass;
}
export interface YeonjangRawCapabilityMatrixEntry {
    supported?: boolean;
    supportState?: unknown;
    requiresApproval?: boolean;
    requiresPermission?: boolean;
    permissionSetting?: string | null;
    outputModes?: readonly string[];
    lastCheckedAt?: number;
}
export interface YeonjangRawMethodCapabilityEntry {
    name?: string;
    implemented?: boolean;
}
export interface YeonjangCapabilityNormalizeInput {
    capabilityMatrix?: Record<string, YeonjangRawCapabilityMatrixEntry> | null;
    capability_matrix?: Record<string, YeonjangRawCapabilityMatrixEntry> | null;
    methods?: readonly YeonjangRawMethodCapabilityEntry[] | null;
}
export interface YeonjangNormalizedCapability extends YeonjangCapabilityClassification {
    capabilityId: string;
    method: string;
    supportState: YeonjangCapabilitySupportState;
    requiresApproval: boolean;
    requiresPermission: boolean;
    permissionSetting: string | null;
    outputModes: readonly string[];
    lastCheckedAt: number | null;
    compatibilityMode: YeonjangCapabilityCompatibilityMode;
}
export interface YeonjangCapabilitySchemaIssue {
    method?: string;
    reasonCode: "empty_method_name" | "invalid_support_state" | "legacy_methods_only" | "web_search_capability_removed" | "missing_capability_source";
    severity: YeonjangCapabilityIssueSeverity;
}
export interface YeonjangCapabilityNormalizeResult {
    capabilities: readonly YeonjangNormalizedCapability[];
    issues: readonly YeonjangCapabilitySchemaIssue[];
}
export declare function isYeonjangWebSearchCapabilityMethod(method: string): boolean;
export declare function classifyYeonjangCapabilityMethod(method: string): YeonjangCapabilityClassification;
export declare function normalizeYeonjangCapabilityMatrix(input: YeonjangCapabilityNormalizeInput): YeonjangCapabilityNormalizeResult;
//# sourceMappingURL=yeonjang-capability-schema.d.ts.map