import type { ExtensionLiveSmokeSelection } from "../runs/extension-live-smoke-runner.js";
import type { YeonjangLiveSmokeSelection } from "../runs/yeonjang-live-smoke-runner.js";
import type { LiveAcceptanceExecutionSelection } from "./live-acceptance-execution-request.js";
export type LiveAcceptanceSnapshotCapability = "skill" | "mcp";
export type LiveAcceptanceSnapshotCapabilityKind = "skill" | "mcp_server";
export type LiveAcceptanceSnapshotStatus = "enabled" | "disabled" | "archived";
export type LiveAcceptanceSnapshotRisk = "safe" | "moderate" | "external" | "sensitive" | "dangerous";
export interface LiveAcceptanceExtensionBindingSnapshot {
    readonly bindingId: string;
    readonly agentId: string;
    readonly capabilityKind: LiveAcceptanceSnapshotCapabilityKind;
    readonly catalogId: string;
    readonly bindingStatus: LiveAcceptanceSnapshotStatus;
    readonly secretScopeId: string | null;
    readonly enabledToolNamesJson: string;
    readonly disabledToolNamesJson: string;
}
export interface LiveAcceptanceCatalogSnapshot {
    readonly capability: LiveAcceptanceSnapshotCapability;
    readonly catalogId: string;
    readonly status: LiveAcceptanceSnapshotStatus;
    readonly risk: LiveAcceptanceSnapshotRisk;
    readonly toolNamesJson: string;
}
export interface LiveAcceptanceToolMetadataSnapshot {
    readonly name: string;
    readonly riskLevel: "safe" | "moderate" | "dangerous";
    readonly requiresApproval: boolean;
    readonly hasSideEffect: boolean;
}
export interface LiveAcceptanceYeonjangSessionSnapshot {
    readonly sessionId: string;
    readonly state: string;
    readonly lastSeenAt: number;
    readonly endedAt: number | null;
    readonly stale: boolean;
}
export interface LiveAcceptanceYeonjangInstanceSnapshot {
    readonly instanceId: string;
    readonly displayName: string;
    readonly state: "discovered" | "online" | "degraded" | "offline" | "update_required" | "permission_required";
    readonly trustState: "pending" | "trusted" | "revoked" | "quarantined";
    readonly scopeAccess: "allowed" | "foreign" | "unassigned";
    readonly runnableTarget: boolean;
    readonly liveSessionCount: number;
    readonly duplicateLiveSessionDetected: boolean;
    readonly session: LiveAcceptanceYeonjangSessionSnapshot | null;
}
export interface LiveAcceptanceRuntimeSnapshot {
    readonly capturedAt: number;
    readonly extensions: readonly LiveAcceptanceExtensionBindingSnapshot[];
    readonly catalogs: readonly LiveAcceptanceCatalogSnapshot[];
    readonly tools: readonly LiveAcceptanceToolMetadataSnapshot[];
    readonly yeonjangInstances: readonly LiveAcceptanceYeonjangInstanceSnapshot[];
}
export type LiveAcceptanceSelectionPreflightReasonCode = "live_preflight_input_invalid" | "live_preflight_extension_set_invalid" | "live_preflight_binding_missing" | "live_preflight_binding_ambiguous" | "live_preflight_binding_owner_mismatch" | "live_preflight_binding_kind_mismatch" | "live_preflight_binding_catalog_mismatch" | "live_preflight_binding_not_enabled" | "live_preflight_binding_secret_scope_missing" | "live_preflight_binding_tool_list_invalid" | "live_preflight_binding_tool_not_allowed" | "live_preflight_binding_tool_disabled" | "live_preflight_catalog_missing" | "live_preflight_catalog_ambiguous" | "live_preflight_catalog_not_enabled" | "live_preflight_catalog_not_safe" | "live_preflight_catalog_tool_list_invalid" | "live_preflight_catalog_tool_mismatch" | "live_preflight_tool_missing" | "live_preflight_tool_ambiguous" | "live_preflight_tool_not_read_only" | "live_preflight_yeonjang_missing" | "live_preflight_yeonjang_ambiguous" | "live_preflight_yeonjang_not_online" | "live_preflight_yeonjang_untrusted" | "live_preflight_yeonjang_scope_denied" | "live_preflight_yeonjang_not_runnable" | "live_preflight_yeonjang_duplicate" | "live_preflight_yeonjang_session_missing" | "live_preflight_yeonjang_session_mismatch" | "live_preflight_yeonjang_session_inactive" | "live_preflight_yeonjang_session_stale";
export type LiveAcceptanceSelectionPreflightResult = {
    readonly status: "verified";
    readonly snapshotCapturedAt: number;
    readonly extensions: readonly ExtensionLiveSmokeSelection[];
    readonly yeonjang: YeonjangLiveSmokeSelection;
} | {
    readonly status: "rejected";
    readonly reasonCode: LiveAcceptanceSelectionPreflightReasonCode;
};
export type LiveAcceptanceSelectionAvailabilityCapability = "skill" | "mcp" | "yeonjang";
export type LiveAcceptanceSelectionAvailability = {
    readonly capability: LiveAcceptanceSelectionAvailabilityCapability;
    readonly status: "ready";
} | {
    readonly capability: LiveAcceptanceSelectionAvailabilityCapability;
    readonly status: "unavailable";
    readonly reasonCode: "live_acceptance_skill_selection_unavailable" | "live_acceptance_mcp_selection_unavailable" | "live_acceptance_yeonjang_selection_unavailable";
};
export declare function inspectLiveAcceptanceSelectionAvailability(input: {
    readonly snapshot: LiveAcceptanceRuntimeSnapshot;
    readonly now: number;
    readonly maxYeonjangAgeMs: number;
}): readonly LiveAcceptanceSelectionAvailability[];
export declare function resolveLiveAcceptanceExecutionSelections(input: {
    readonly selection: LiveAcceptanceExecutionSelection;
    readonly snapshot: LiveAcceptanceRuntimeSnapshot;
    readonly now: number;
    readonly maxYeonjangAgeMs: number;
}): LiveAcceptanceSelectionPreflightResult;
//# sourceMappingURL=live-acceptance-selection-preflight.d.ts.map