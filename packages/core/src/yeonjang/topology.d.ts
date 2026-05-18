import type { MqttExtensionSnapshot } from "../mqtt/broker.js";
import { type YeonjangInstanceTrustState, type YeonjangRegistryInstanceView, type YeonjangRegistrySummary } from "./registry.js";
export type YeonjangSupportProfile = "desktop_interactive" | "desktop_limited" | "headless_managed";
export type YeonjangInstanceLocation = "local" | "remote";
export type YeonjangLocalityConfidence = "high" | "medium" | "low";
export type YeonjangTrustState = YeonjangInstanceTrustState;
export type YeonjangDefaultTargetUiAction = "none" | "ask_user" | "ui_selection";
export interface YeonjangProjectedInstance extends YeonjangRegistryInstanceView {
    supportProfile: YeonjangSupportProfile;
    location: YeonjangInstanceLocation;
    localityConfidence: YeonjangLocalityConfidence;
    localityReasonCodes: string[];
    trustState: YeonjangTrustState;
    scopeAccess: YeonjangRegistryInstanceView["scopeAccess"];
    runnableTarget: boolean;
    runnableReasonCodes: string[];
    interactiveDesktop: boolean;
    trayWindowExpected: boolean;
    buildTarget: string | null;
    supportedMethods: string[];
    connectivityLatencyMs: number | null;
    lastHeartbeatAgeMs: number | null;
    defaultTargetEligible: boolean;
    defaultTargetReasonCodes: string[];
}
export interface YeonjangDiffField<T> {
    local: T;
    remote: T;
    different: boolean;
}
export interface YeonjangLocalRemoteDiffSummary {
    localInstanceId: string;
    localNodeId: string;
    remoteInstanceId: string;
    remoteNodeId: string;
    reasonCodes: string[];
    version: YeonjangDiffField<string | null>;
    protocolVersion: YeonjangDiffField<string | null>;
    permissionState: YeonjangDiffField<string>;
    buildTarget: YeonjangDiffField<string | null>;
    platform: YeonjangDiffField<string | null>;
    connectivityLatencyMs: YeonjangDiffField<number | null>;
    lastHeartbeatAgeMs: YeonjangDiffField<number | null>;
    supportedMethods: {
        localOnly: string[];
        remoteOnly: string[];
    };
    updateRequired: boolean;
    permissionMismatch: boolean;
}
export interface YeonjangDefaultTargetSelection {
    ok: boolean;
    status: "auto_selected_local_interactive" | "auto_selected_pinned_remote" | "selection_required" | "ambiguous_state";
    reasonCodes: string[];
    uiAction: YeonjangDefaultTargetUiAction;
    extensionId?: string;
    instanceId?: string;
    targetSessionId?: string | null;
}
export interface YeonjangProjectionSummary extends YeonjangRegistrySummary {
    supportProfiles: {
        desktopInteractive: number;
        desktopLimited: number;
        headlessManaged: number;
    };
    duplicateLocalDetected: boolean;
    defaultTarget: YeonjangDefaultTargetSelection;
}
export interface YeonjangPromptTargetCandidate {
    instanceId: string;
    nodeId: string;
    instanceAlias: string;
    displayName: string;
    normalizedCallName: string;
    location: YeonjangInstanceLocation;
    supportProfile: YeonjangSupportProfile;
    trustState: YeonjangTrustState;
    scopeAccess: YeonjangRegistryInstanceView["scopeAccess"];
    state: YeonjangProjectedInstance["state"];
    defaultTargetEligible: boolean;
}
export interface YeonjangPromptProjection {
    registrySummary: YeonjangProjectionSummary;
    exactTargetCandidates: YeonjangPromptTargetCandidate[];
    defaultTarget: YeonjangDefaultTargetSelection;
    localRemoteDiffs: YeonjangLocalRemoteDiffSummary[];
}
export interface YeonjangFleetProjection {
    summary: YeonjangProjectionSummary;
    instances: YeonjangProjectedInstance[];
    diffSummaries: YeonjangLocalRemoteDiffSummary[];
    promptProjection: YeonjangPromptProjection;
}
export interface YeonjangFleetProjectionInput {
    instances?: YeonjangRegistryInstanceView[];
    snapshots?: MqttExtensionSnapshot[];
    registrySummary?: YeonjangRegistrySummary;
    now?: number;
    pinnedDefaultRemoteInstanceId?: string | null;
}
export declare function normalizeYeonjangSupportProfile(value: string | null | undefined): YeonjangSupportProfile;
export declare function normalizeYeonjangTrustState(value: string | null | undefined): YeonjangTrustState;
export declare function projectYeonjangInstances(input?: Omit<YeonjangFleetProjectionInput, "pinnedDefaultRemoteInstanceId" | "registrySummary">): YeonjangProjectedInstance[];
export declare function resolveYeonjangDefaultTargetSelection(input?: YeonjangFleetProjectionInput): YeonjangDefaultTargetSelection;
export declare function buildYeonjangLocalRemoteDiffSummaries(input?: Omit<YeonjangFleetProjectionInput, "pinnedDefaultRemoteInstanceId" | "registrySummary">): YeonjangLocalRemoteDiffSummary[];
export declare function buildYeonjangPromptProjection(input?: YeonjangFleetProjectionInput): YeonjangPromptProjection;
export declare function buildYeonjangFleetProjection(input?: YeonjangFleetProjectionInput): YeonjangFleetProjection;
//# sourceMappingURL=topology.d.ts.map