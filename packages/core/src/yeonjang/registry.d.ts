import type Database from "better-sqlite3";
export type YeonjangInstanceTrustState = "pending" | "trusted" | "revoked" | "quarantined";
export type YeonjangScopeAccess = "allowed" | "foreign" | "unassigned";
export interface YeonjangRegistryObservation {
    instanceId: string;
    instanceAlias: string;
    displayName: string;
    nodeId: string;
    supportProfile: string;
    platform?: string | null;
    arch?: string | null;
    hostFingerprint?: string | null;
    installFingerprint?: string | null;
    sessionId: string;
    clientId?: string | null;
    connectionState?: string | null;
    message?: string | null;
    version?: string | null;
    protocolVersion?: string | null;
    capabilityHash?: string | null;
    transport?: string[];
    permissions?: Record<string, unknown> | null;
    toolHealth?: Record<string, unknown> | null;
    capabilityMatrix?: Record<string, unknown> | null;
    methodCount?: number;
    startupMode?: string | null;
    windowMode?: string | null;
    trayState?: string | null;
    workspaceScopeId?: string | null;
    pairingFingerprint?: string | null;
    trustState?: YeonjangInstanceTrustState | null;
    observedAt?: number;
}
export type YeonjangSessionClaimOutcome = "accepted" | "replaced" | "quarantined";
export type YeonjangRegistryWriteResult = {
    ok: true;
    instanceId: string;
    sessionId: string;
    claimOutcome: YeonjangSessionClaimOutcome;
    reasonCode?: string | null;
    replacedSessionIds?: string[];
} | {
    ok: false;
    code: "invalid_identity" | "reserved_call_name" | "call_name_conflict";
    message: string;
};
export type YeonjangPairingApprovalResult = {
    ok: true;
    instanceId: string;
    trustState: YeonjangInstanceTrustState;
} | {
    ok: false;
    code: "instance_not_found" | "pairing_secret_required" | "pairing_secret_unavailable" | "invalid_pairing_secret";
    message: string;
};
export type YeonjangTrustMutationResult = {
    ok: true;
    instanceId: string;
    trustState: YeonjangInstanceTrustState;
} | {
    ok: false;
    code: "instance_not_found" | "invalid_trust_state";
    message: string;
};
export type YeonjangRenameResult = {
    ok: true;
    instanceId: string;
    instanceAlias: string;
    displayName: string;
} | {
    ok: false;
    code: "instance_not_found" | "invalid_identity" | "reserved_call_name" | "call_name_conflict";
    message: string;
};
export type YeonjangLocalMarkerResult = {
    ok: true;
    instanceId: string;
} | {
    ok: false;
    code: "instance_not_found";
    message: string;
};
export interface YeonjangRegistrySessionView {
    sessionId: string;
    clientId: string | null;
    startupMode: string | null;
    windowMode: string | null;
    trayState: string | null;
    state: string;
    message: string | null;
    startedAt: number;
    lastSeenAt: number;
    endedAt: number | null;
    stale: boolean;
}
export interface YeonjangRegistryInstanceView {
    instanceId: string;
    instanceAlias: string;
    displayName: string;
    normalizedCallName: string;
    nodeId: string;
    supportProfile: string;
    platform: string | null;
    arch: string | null;
    version: string | null;
    protocolVersion: string | null;
    capabilityHash: string | null;
    methodCount: number;
    state: "discovered" | "online" | "degraded" | "offline" | "update_required" | "permission_required";
    stateMessage: string | null;
    lastSeenAt: number | null;
    liveSessionCount: number;
    duplicateLiveSessionDetected: boolean;
    isLocalCandidate: boolean;
    localMarker: boolean;
    ownerUserId: string | null;
    workspaceScopeId: string | null;
    scopeAccess: YeonjangScopeAccess;
    trustState: YeonjangInstanceTrustState;
    trustReason: string | null;
    pairingFingerprintPreview: string | null;
    runnableTarget: boolean;
    runnableReasonCodes: string[];
    hostFingerprintPreview: string | null;
    installFingerprintPreview: string | null;
    transport: string[];
    session: YeonjangRegistrySessionView | null;
}
export interface YeonjangRegistrySummary {
    totalInstances: number;
    online: number;
    offline: number;
    degraded: number;
    permissionRequired: number;
    updateRequired: number;
    discovered: number;
    duplicateLiveSessionInstances: number;
    duplicateConflictCount: number;
    localCandidates: number;
    localInstances: number;
    remoteInstances: number;
    trusted: number;
    pending: number;
    revoked: number;
    quarantined: number;
    foreignInstances: number;
    unassignedScopeInstances: number;
    activeWorkspaceScopeId: string;
    localMarkerInstanceId: string | null;
}
export interface YeonjangGovernanceEventView {
    id: string;
    at: number;
    action: string;
    result: string;
    actor: string | null;
    instanceId: string | null;
    instanceAlias: string | null;
    displayName: string | null;
    workspaceScopeId: string | null;
    trustState: string | null;
    reason: string | null;
}
export declare function hashYeonjangPairingSecret(secret: string): string;
export declare function normalizeYeonjangTrustState(value: string | null | undefined): YeonjangInstanceTrustState;
export declare function normalizeYeonjangCallName(value: string): string;
export declare function recordYeonjangGovernanceAudit(input: {
    action: string;
    result?: "success" | "failure" | "skipped";
    actor?: string | null;
    instanceId?: string | null;
    instanceAlias?: string | null;
    displayName?: string | null;
    workspaceScopeId?: string | null;
    trustState?: string | null;
    reason?: string | null;
    detail?: Record<string, unknown>;
}): void;
export declare function upsertYeonjangRegistryObservation(input: YeonjangRegistryObservation, options?: {
    db?: Database.Database;
}): YeonjangRegistryWriteResult;
export declare function approveYeonjangInstancePairing(input: {
    instanceId: string;
    pairingSecret: string;
    actor: string;
    ownerUserId?: string | null;
    workspaceScopeId?: string | null;
    reason?: string | null;
    db?: Database.Database;
}): YeonjangPairingApprovalResult;
export declare function updateYeonjangInstanceTrustState(input: {
    instanceId: string;
    trustState: YeonjangInstanceTrustState;
    actor: string;
    reason?: string | null;
    db?: Database.Database;
}): YeonjangTrustMutationResult;
export declare function renameYeonjangRegistryInstance(input: {
    instanceId: string;
    instanceAlias?: string | null;
    displayName?: string | null;
    actor: string;
    reason?: string | null;
    db?: Database.Database;
}): YeonjangRenameResult;
export declare function assignYeonjangLocalMarker(input: {
    instanceId: string;
    actor: string;
    reason?: string | null;
    db?: Database.Database;
}): YeonjangLocalMarkerResult;
export declare function listYeonjangGovernanceHistory(options?: {
    db?: Database.Database;
    limit?: number;
}): YeonjangGovernanceEventView[];
export declare function listYeonjangRegistryInstances(options?: {
    db?: Database.Database;
    now?: number;
}): YeonjangRegistryInstanceView[];
export declare function getYeonjangRegistrySummary(options?: {
    db?: Database.Database;
    now?: number;
}): YeonjangRegistrySummary;
//# sourceMappingURL=registry.d.ts.map