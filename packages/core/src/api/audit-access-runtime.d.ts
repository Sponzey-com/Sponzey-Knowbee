import type { FastifyRequest } from "fastify";
import { type AuditAccessOperation, type AuditAccessPrincipal, type AuditAccessReceipt } from "../security/audit-access.js";
export interface AuditAccessRecordResult {
    readonly recorded: boolean;
    readonly reasonCode?: "audit_access_record_failed";
}
export interface AuditAccessRuntimeDependencies {
    resolvePrincipal(request: FastifyRequest): AuditAccessPrincipal | null;
    recordAccess?(receipt: AuditAccessReceipt): AuditAccessRecordResult;
    now?(): number;
}
export declare const AUTHENTICATED_API_AUDIT_DEPENDENCIES: AuditAccessRuntimeDependencies;
export interface AuditAccessRuntimeOutcome {
    readonly allowed: boolean;
    readonly reasonCode: string;
}
export declare function authorizeAndRecordAuditAccess(input: {
    request: FastifyRequest;
    purpose: string | undefined;
    operation: AuditAccessOperation;
    runId?: string;
    requestGroupId?: string;
    scopeRef?: string;
    dependencies?: AuditAccessRuntimeDependencies;
}): AuditAccessRuntimeOutcome;
export declare function auditAccessHttpFailure(outcome: AuditAccessRuntimeOutcome): {
    statusCode: 403 | 503;
    body: {
        error: "audit_access_denied" | "audit_access_unavailable";
        reasonCode: string;
    };
};
//# sourceMappingURL=audit-access-runtime.d.ts.map