import { type YeonjangTargetSelector } from "../../contracts/yeonjang-target.js";
import { type YeonjangFleetProjectionInput, type YeonjangProjectedInstance, type YeonjangTrustState, type YeonjangSupportProfile } from "../../yeonjang/topology.js";
import type { ToolContext } from "../types.js";
export interface YeonjangTargetResolutionCandidate {
    instanceId: string;
    extensionId: string;
    instanceAlias: string;
    displayName: string;
    normalizedAlias: string;
    normalizedDisplayName: string;
    normalizedCallName: string;
    location: YeonjangProjectedInstance["location"];
    supportProfile: YeonjangSupportProfile;
    trustState: YeonjangTrustState;
    scopeAccess: YeonjangProjectedInstance["scopeAccess"];
    state: YeonjangProjectedInstance["state"];
}
export interface YeonjangTargetValidationResults {
    selector: "pass" | "fail" | "not_applicable";
    selectorMode: "pass" | "fail" | "not_applicable";
    availability: "pass" | "fail" | "not_applicable";
    supportProfile: "pass" | "fail" | "not_applicable";
    sessionBinding: "pass" | "fail" | "not_available" | "not_applicable";
    trust: "pass" | "fail" | "not_evaluated";
}
export interface YeonjangTargetResolutionProof {
    policyVersion: "2026-05-15.yeonjang-target-selector.v1";
    explicitTarget: boolean;
    selectorSource: "default_target_policy" | "structured_target_selector" | "legacy_extension_id";
    selectorInput: YeonjangTargetSelector | null;
    selectorSerialized: string | null;
    legacyRequestedExtensionId: string | null;
    selectionStatus: YeonjangTargetSelection["status"];
    matchedField: string | null;
    matchedValue: string | null;
    matchedInstanceId: string | null;
    matchedExtensionId: string | null;
    matchedSessionId: string | null;
    expectedTargetSessionId: string | null;
    candidateList: YeonjangTargetResolutionCandidate[];
    validationResults: YeonjangTargetValidationResults;
    reasonCodes: string[];
}
export interface YeonjangTargetSelection {
    ok: boolean;
    explicitTarget: boolean;
    selector: YeonjangTargetSelector | null;
    extensionId?: string;
    instanceId?: string;
    targetSessionId?: string | null;
    status: "exact_match" | "auto_selected_local_interactive" | "auto_selected_pinned_remote" | "selection_required" | "ambiguous_state" | "invalid_selector" | "unsupported_selector_mode" | "target_unavailable" | "stale_target";
    reasonCodes: string[];
    uiAction: "none" | "ask_user" | "ui_selection";
    proof: YeonjangTargetResolutionProof;
}
export interface YeonjangTargetedToolParams {
    extensionId?: string;
    targetSelector?: YeonjangTargetSelector;
    targetSessionId?: string;
}
export declare function resolveYeonjangTargetSelection(params: {
    requestedExtensionId?: string | undefined;
    targetSelector?: unknown;
    expectedTargetSessionId?: string | undefined;
    userMessage?: string | undefined;
    pinnedDefaultRemoteInstanceId?: string | undefined;
    requiredSupportProfiles?: YeonjangSupportProfile[] | undefined;
    snapshots?: YeonjangFleetProjectionInput["snapshots"];
    instances?: YeonjangFleetProjectionInput["instances"];
    now?: number | undefined;
}): YeonjangTargetSelection;
export declare function revalidateYeonjangTargetSelection(params: {
    selection: YeonjangTargetSelection;
    requiredSupportProfiles?: YeonjangSupportProfile[] | undefined;
    pinnedDefaultRemoteInstanceId?: string | undefined;
    snapshots?: YeonjangFleetProjectionInput["snapshots"];
    instances?: YeonjangFleetProjectionInput["instances"];
    now?: number | undefined;
}): YeonjangTargetSelection;
export declare function buildYeonjangTargetResolutionDetails(selection: YeonjangTargetSelection): Record<string, unknown>;
export declare function recordYeonjangRemoteExecutionApproval(params: {
    selection: YeonjangTargetSelection;
    toolName: string;
    ctx: Pick<ToolContext, "sessionId" | "runId" | "requestGroupId" | "source">;
}): void;
export declare function buildYeonjangTargetParameterProperties(defaultExtensionId: string): Record<string, unknown>;
export declare function resolvePreferredYeonjangExtensionId(params: {
    requestedExtensionId?: string | undefined;
    targetSelector?: unknown;
    expectedTargetSessionId?: string | undefined;
    userMessage?: string | undefined;
    pinnedDefaultRemoteInstanceId?: string | undefined;
    requiredSupportProfiles?: YeonjangSupportProfile[] | undefined;
}): string | undefined;
export declare function buildYeonjangTargetSelectionFailure(selection: YeonjangTargetSelection): {
    output: string;
    error: string;
    details: Record<string, unknown>;
};
//# sourceMappingURL=yeonjang-target.d.ts.map