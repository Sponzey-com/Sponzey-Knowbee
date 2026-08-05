import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export type YeonjangBrowserActiveTabInfoEvidenceVisibility = "raw" | "redacted" | "evidence_ref";
export type YeonjangBrowserActiveTabInfoEvidenceDestination = "audit_record" | "readiness_route" | "diagnostics_route" | "pre_dispatch_preview" | "webui_state" | "product_log" | "field_debug_log" | "development_log" | "final_response";
export type YeonjangBrowserActiveTabInfoRawDetailField = "browserName" | "title" | "url" | "profileName" | "profilePath" | "pid" | "windowId" | "tabId";
export type YeonjangBrowserActiveTabInfoPublicUseRule = "redacted_projection_only" | "redacted_observation_or_evidence_ref" | "evidence_reference_only" | "redacted_summary_only";
export interface YeonjangBrowserActiveTabInfoAuditEvidencePolicy {
    schemaVersion: "yeonjang-browser-active-tab-info-audit-evidence-boundary-v1";
    method: typeof YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method;
    rawEvidenceVisibility: "audit_only";
    retentionScope: "ephemeral_registry_snapshot";
    retentionOwner: "yeonjang_registry_tool_health";
    auditAccessMode: "explicit_audit_context_only";
    defaultLiveSmokeAllowed: false;
    rawDetailFields: YeonjangBrowserActiveTabInfoRawDetailField[];
    publicRedactedFields: string[];
    prohibitedPublicFields: string[];
    publicDestinations: Record<Exclude<YeonjangBrowserActiveTabInfoEvidenceDestination, "audit_record">, YeonjangBrowserActiveTabInfoPublicUseRule>;
}
export type YeonjangBrowserActiveTabInfoEvidenceUseValidation = {
    ok: true;
} | {
    ok: false;
    reasonCode: "explicit_audit_context_required" | "raw_evidence_destination_forbidden" | "raw_field_unknown" | "public_field_not_redacted" | "product_log_evidence_ref_only";
    field?: string | undefined;
};
export declare function createYeonjangBrowserActiveTabInfoAuditEvidencePolicy(): YeonjangBrowserActiveTabInfoAuditEvidencePolicy;
export declare function validateYeonjangBrowserActiveTabInfoEvidenceUse(input: {
    destination: YeonjangBrowserActiveTabInfoEvidenceDestination;
    visibility: YeonjangBrowserActiveTabInfoEvidenceVisibility;
    explicitAuditContext: boolean;
    fields: readonly string[];
}): YeonjangBrowserActiveTabInfoEvidenceUseValidation;
//# sourceMappingURL=yeonjang-browser-active-tab-info-audit-evidence-boundary.d.ts.map