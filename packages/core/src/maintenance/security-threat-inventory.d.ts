export declare const REQUIRED_SECURITY_THREAT_CLASSES: readonly ["ssrf", "path_traversal", "command_argument_injection", "capability_metadata_injection", "audit_privilege_escalation", "cross_owner_access"];
export type SecurityThreatClass = (typeof REQUIRED_SECURITY_THREAT_CLASSES)[number];
export type SecurityBoundaryKind = "external_input" | "network_input" | "filesystem_input" | "process_input" | "capability_input" | "audit_input" | "owner_scoped_input";
export interface SecurityThreatEvidenceRef {
    artifactId: string;
    marker: string;
}
export interface SecurityThreatSurface {
    surfaceId: string;
    threatClass: SecurityThreatClass;
    boundaryKind: SecurityBoundaryKind;
    ownerSources: SecurityThreatEvidenceRef[];
    mitigationTests: SecurityThreatEvidenceRef[];
}
export type SecurityThreatInventoryDiagnosticCode = "duplicate_surface_id" | "required_threat_class_missing" | "owner_source_not_declared" | "owner_source_missing" | "owner_marker_missing" | "mitigation_test_not_declared" | "mitigation_test_missing" | "mitigation_marker_missing";
export interface SecurityThreatInventoryDiagnostic {
    code: SecurityThreatInventoryDiagnosticCode;
    surfaceId: string;
    artifactId: string | null;
}
export interface SecurityThreatSurfaceAudit {
    surfaceId: string;
    threatClass: SecurityThreatClass;
    boundaryKind: SecurityBoundaryKind;
    ownerArtifacts: string[];
    mitigationTestArtifacts: string[];
    verified: boolean;
}
export interface SecurityThreatInventoryAudit {
    schemaVersion: 1;
    complete: boolean;
    counts: {
        requiredThreatClasses: number;
        coveredThreatClasses: number;
        surfaces: number;
        verifiedSurfaces: number;
        incompleteSurfaces: number;
    };
    surfaces: SecurityThreatSurfaceAudit[];
    diagnostics: SecurityThreatInventoryDiagnostic[];
}
export declare const DEFAULT_SECURITY_THREAT_SURFACES: readonly SecurityThreatSurface[];
export declare function auditSecurityThreatInventory(input: {
    surfaces: readonly SecurityThreatSurface[];
    readArtifact: (artifactId: string) => string | undefined;
    requiredThreatClasses?: readonly SecurityThreatClass[];
}): SecurityThreatInventoryAudit;
//# sourceMappingURL=security-threat-inventory.d.ts.map