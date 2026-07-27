export type AuditAccessRole = "audit_reader" | "administrator";
export type AuditAccessPurpose = "incident_review" | "quality_review" | "security_review";
export type AuditAccessOperation = "view" | "export" | "cleanup_preview" | "cleanup_delete" | "promote_error_corpus";
export interface AuditAccessPrincipal {
    readonly principalRef: string;
    readonly role: string;
    readonly runIds: readonly string[];
    readonly requestGroupIds: readonly string[];
    readonly scopeRefs?: readonly string[];
}
export interface AuditAccessRequest {
    readonly principal: AuditAccessPrincipal | null;
    readonly purpose: string | undefined;
    readonly operation: AuditAccessOperation;
    readonly runId?: string;
    readonly requestGroupId?: string;
    readonly scopeRef?: string;
}
export type AuditAccessReasonCode = "audit_access_allowed" | "audit_principal_missing" | "audit_role_denied" | "audit_operation_denied" | "audit_purpose_invalid" | "audit_scope_missing" | "audit_scope_denied";
export interface AuditAccessDecision {
    readonly allowed: boolean;
    readonly reasonCode: AuditAccessReasonCode;
}
export declare function decideAuditAccess(input: AuditAccessRequest): AuditAccessDecision;
export interface AuditAccessReceipt {
    readonly schemaVersion: "audit-access-v2";
    readonly principalRef: string | null;
    readonly role: string | null;
    readonly purpose: string | null;
    readonly operation: AuditAccessOperation;
    readonly runId: string | null;
    readonly requestGroupId: string | null;
    readonly scopeRef: string | null;
    readonly result: "allowed" | "denied";
    readonly reasonCode: AuditAccessReasonCode;
    readonly at: number;
}
export declare function createAuditAccessReceipt(input: AuditAccessRequest, decision: AuditAccessDecision, at: number): AuditAccessReceipt;
//# sourceMappingURL=audit-access.d.ts.map