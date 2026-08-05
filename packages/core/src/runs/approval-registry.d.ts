import type { ApprovalDecision, ApprovalKind, ApprovalResolutionReason } from "../events/index.js";
import type { RiskLevel } from "../tools/types.js";
export type ApprovalRegistryStatus = "requested" | "approved_once" | "approved_run" | "denied" | "expired" | "superseded" | "consumed";
export interface ApprovalRegistryRow {
    id: string;
    run_id: string;
    request_group_id: string | null;
    channel: string;
    channel_message_id: string | null;
    tool_name: string;
    risk_level: string;
    kind: ApprovalKind;
    status: ApprovalRegistryStatus;
    params_hash: string;
    params_preview_json: string | null;
    requested_at: number;
    expires_at: number | null;
    consumed_at: number | null;
    decision_at: number | null;
    decision_by: string | null;
    decision_source: string | null;
    superseded_by: string | null;
    metadata_json: string | null;
    operation_id: string | null;
    operation_binding_hash: string | null;
    continuation_schema_version: number | null;
    decision_actor_fingerprint: string | null;
    created_at: number;
    updated_at: number;
}
export interface CreateApprovalRegistryRequestInput {
    id?: string;
    runId: string;
    requestGroupId?: string | null;
    channel: string;
    toolName: string;
    riskLevel: RiskLevel | string;
    kind: ApprovalKind;
    params: unknown;
    authorizationParams?: unknown;
    expiresAt?: number | null;
    channelMessageId?: string | null;
    metadata?: Record<string, unknown>;
    operationBinding?: ApprovalOperationBinding;
    now?: number;
    supersedePending?: boolean;
}
export interface ApprovalOperationBinding {
    operationId: string;
    operationBindingHash: `sha256:${string}`;
    continuationSchemaVersion: number;
}
export interface ApprovalRegistryDecisionResult {
    accepted: boolean;
    status: ApprovalRegistryStatus | "missing";
    decision?: ApprovalDecision;
    reason?: ApprovalResolutionReason | "late" | "already_consumed" | "superseded" | "scope_mismatch";
    row?: ApprovalRegistryRow;
}
export interface ApprovalConsumptionScope {
    runId: string;
    requestGroupId?: string | null;
    toolName: string;
    params: unknown;
    authorizationParams?: unknown;
    agentId?: string | null;
    operationBinding?: ApprovalOperationBinding;
}
export type ApprovalRegistryGrantAcquisition = {
    acquired: true;
    decision: "allow_once" | "allow_run";
    approvalId: string;
    source: "approved" | "consumed_run";
    row: ApprovalRegistryRow;
} | {
    acquired: false;
    reasonCode: "approval_grant_not_found" | "approval_grant_scope_mismatch";
};
export declare function stableStringify(value: unknown): string;
export declare function hashApprovalParams(params: unknown): string;
export declare function hashApprovalDecisionActor(input: {
    channel: string;
    actorId: string;
}): `sha256:${string}`;
export declare function createApprovalRegistryRequest(input: CreateApprovalRegistryRequestInput): ApprovalRegistryRow;
export declare function getApprovalRegistryRow(id: string): ApprovalRegistryRow | undefined;
export declare function getLatestApprovalForRun(runId: string): ApprovalRegistryRow | undefined;
export declare function getActiveApprovalForRun(runId: string): ApprovalRegistryRow | undefined;
export declare function findLatestApprovalByChannelMessage(params: {
    channel: string;
    channelMessageId: string;
}): ApprovalRegistryRow | undefined;
export declare function attachApprovalChannelMessage(approvalId: string, channelMessageId: string, now?: number): boolean;
export declare function attachApprovalChannelBinding(input: {
    approvalId: string;
    channelMessageId: string;
    decisionActorFingerprint: `sha256:${string}`;
    now?: number;
}): boolean;
export declare function listRequestedApprovalsForChannelCallback(input: {
    runId: string;
    channel: string;
    channelMessageId: string;
    decisionActorFingerprint: `sha256:${string}`;
    now?: number;
}): ApprovalRegistryRow[];
export declare function expireApprovalRegistryRequest(approvalId: string, now?: number): ApprovalRegistryDecisionResult;
export declare function resolveApprovalRegistryDecision(params: {
    approvalId: string;
    decision: ApprovalDecision;
    decisionBy?: string | null;
    decisionSource: string;
    now?: number;
}): ApprovalRegistryDecisionResult;
export declare function consumeApprovalRegistryDecision(approvalId: string, now?: number, expected?: ApprovalConsumptionScope): ApprovalRegistryDecisionResult;
export declare function acquireApprovalRegistryGrant(expected: ApprovalConsumptionScope, now?: number): ApprovalRegistryGrantAcquisition;
export type ApprovalNoticeLanguage = "ko" | "en";
export declare function describeLateApproval(row: ApprovalRegistryRow | undefined, language?: ApprovalNoticeLanguage): string;
//# sourceMappingURL=approval-registry.d.ts.map