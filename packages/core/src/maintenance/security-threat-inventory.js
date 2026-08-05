export const REQUIRED_SECURITY_THREAT_CLASSES = [
    "ssrf",
    "path_traversal",
    "command_argument_injection",
    "capability_metadata_injection",
    "audit_privilege_escalation",
    "cross_owner_access",
];
export const DEFAULT_SECURITY_THREAT_SURFACES = [
    {
        surfaceId: "network:web-fetch",
        threatClass: "ssrf",
        boundaryKind: "network_input",
        ownerSources: [
            {
                artifactId: "packages/core/src/security/network-target-policy.ts",
                marker: "evaluatePublicNetworkTarget",
            },
            { artifactId: "packages/core/src/adapters/public-http-fetch.ts", marker: 'redirect: "manual"' },
        ],
        mitigationTests: [
            {
                artifactId: "tests/task004-network-target-policy.test.ts",
                marker: "fails closed when any DNS answer is non-public",
            },
            {
                artifactId: "tests/task004-web-fetch-ssrf.test.ts",
                marker: "rejects a redirect to a private target before the second request",
            },
        ],
    },
    {
        surfaceId: "filesystem:tool-policy",
        threatClass: "path_traversal",
        boundaryKind: "filesystem_input",
        ownerSources: [
            { artifactId: "packages/core/src/security/tool-policy.ts", marker: "path_not_allowed" },
        ],
        mitigationTests: [
            { artifactId: "tests/task004-security-boundary.test.ts", marker: "path_not_allowed" },
        ],
    },
    {
        surfaceId: "process:tool-policy",
        threatClass: "command_argument_injection",
        boundaryKind: "process_input",
        ownerSources: [
            { artifactId: "packages/core/src/security/tool-policy.ts", marker: "command_not_allowed" },
        ],
        mitigationTests: [
            { artifactId: "tests/task004-security-boundary.test.ts", marker: "command_not_allowed" },
        ],
    },
    {
        surfaceId: "capability:binding-metadata",
        threatClass: "capability_metadata_injection",
        boundaryKind: "capability_input",
        ownerSources: [
            {
                artifactId: "packages/core/src/security/capability-isolation.ts",
                marker: "capability_binding_owner_mismatch",
            },
        ],
        mitigationTests: [
            {
                artifactId: "tests/task020-capability-approval-isolation.test.ts",
                marker: "capability_binding_owner_mismatch",
            },
        ],
    },
    {
        surfaceId: "audit:visibility-escalation",
        threatClass: "audit_privilege_escalation",
        boundaryKind: "audit_input",
        ownerSources: [
            {
                artifactId: "packages/core/src/api/routes/control-timeline.ts",
                marker: "resolveControlTimelineAudience",
            },
        ],
        mitigationTests: [
            {
                artifactId: "tests/internal-llm-data-audit-boundary.test.ts",
                marker: "resolveControlTimelineAudience",
            },
        ],
    },
    {
        surfaceId: "owner:untrusted-evidence",
        threatClass: "cross_owner_access",
        boundaryKind: "owner_scoped_input",
        ownerSources: [
            {
                artifactId: "packages/core/src/security/trust-boundary.ts",
                marker: "untrusted_evidence_owner_mismatch",
            },
            {
                artifactId: "packages/core/src/contracts/agent-memory-ownership.ts",
                marker: "short_term_source_owner_mismatch",
            },
        ],
        mitigationTests: [
            {
                artifactId: "tests/untrusted-evidence-boundary.test.ts",
                marker: "untrusted_evidence_owner_mismatch",
            },
            {
                artifactId: "tests/task1243-agent-memory-ownership.test.ts",
                marker: "short_term_source_owner_mismatch",
            },
        ],
    },
];
function verifyEvidenceRefs(input) {
    if (input.refs.length === 0) {
        input.diagnostics.push({
            code: input.kind === "owner" ? "owner_source_not_declared" : "mitigation_test_not_declared",
            surfaceId: input.surfaceId,
            artifactId: null,
        });
        return;
    }
    for (const ref of input.refs) {
        const content = input.readArtifact(ref.artifactId);
        if (content === undefined) {
            input.diagnostics.push({
                code: input.kind === "owner" ? "owner_source_missing" : "mitigation_test_missing",
                surfaceId: input.surfaceId,
                artifactId: ref.artifactId,
            });
        }
        else if (!content.includes(ref.marker)) {
            input.diagnostics.push({
                code: input.kind === "owner" ? "owner_marker_missing" : "mitigation_marker_missing",
                surfaceId: input.surfaceId,
                artifactId: ref.artifactId,
            });
        }
    }
}
export function auditSecurityThreatInventory(input) {
    const requiredThreatClasses = input.requiredThreatClasses ?? REQUIRED_SECURITY_THREAT_CLASSES;
    const diagnostics = [];
    const idCounts = new Map();
    const coveredThreatClasses = new Set();
    for (const surface of input.surfaces) {
        idCounts.set(surface.surfaceId, (idCounts.get(surface.surfaceId) ?? 0) + 1);
        coveredThreatClasses.add(surface.threatClass);
    }
    for (const [surfaceId, count] of idCounts) {
        if (count > 1)
            diagnostics.push({ code: "duplicate_surface_id", surfaceId, artifactId: null });
    }
    for (const threatClass of requiredThreatClasses) {
        if (!coveredThreatClasses.has(threatClass)) {
            diagnostics.push({
                code: "required_threat_class_missing",
                surfaceId: `threat:${threatClass}`,
                artifactId: null,
            });
        }
    }
    for (const surface of input.surfaces) {
        verifyEvidenceRefs({
            surfaceId: surface.surfaceId,
            refs: surface.ownerSources,
            kind: "owner",
            readArtifact: input.readArtifact,
            diagnostics,
        });
        verifyEvidenceRefs({
            surfaceId: surface.surfaceId,
            refs: surface.mitigationTests,
            kind: "mitigation",
            readArtifact: input.readArtifact,
            diagnostics,
        });
    }
    diagnostics.sort((left, right) => left.surfaceId.localeCompare(right.surfaceId) ||
        left.code.localeCompare(right.code) ||
        (left.artifactId ?? "").localeCompare(right.artifactId ?? ""));
    const incompleteSurfaceIds = new Set(diagnostics
        .map((diagnostic) => diagnostic.surfaceId)
        .filter((surfaceId) => idCounts.has(surfaceId)));
    const surfaces = [...input.surfaces]
        .sort((left, right) => left.surfaceId.localeCompare(right.surfaceId))
        .map((surface) => ({
        surfaceId: surface.surfaceId,
        threatClass: surface.threatClass,
        boundaryKind: surface.boundaryKind,
        ownerArtifacts: surface.ownerSources.map((ref) => ref.artifactId).sort(),
        mitigationTestArtifacts: surface.mitigationTests.map((ref) => ref.artifactId).sort(),
        verified: !incompleteSurfaceIds.has(surface.surfaceId),
    }));
    return {
        schemaVersion: 1,
        complete: diagnostics.length === 0,
        counts: {
            requiredThreatClasses: requiredThreatClasses.length,
            coveredThreatClasses: requiredThreatClasses.filter((item) => coveredThreatClasses.has(item))
                .length,
            surfaces: input.surfaces.length,
            verifiedSurfaces: surfaces.filter((surface) => surface.verified).length,
            incompleteSurfaces: surfaces.filter((surface) => !surface.verified).length,
        },
        surfaces,
        diagnostics,
    };
}
//# sourceMappingURL=security-threat-inventory.js.map