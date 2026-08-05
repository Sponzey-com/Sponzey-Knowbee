export interface MutationEnvelope {
    actorRef: string;
    scope: string;
    mutationId: string;
    targetRevision: number;
    purpose: string;
    issuedAt: number;
    nonce: string;
}
export type MutationEnvelopeDiagnostic = {
    reasonCode: "mutation_field_missing" | "mutation_scope_denied" | "mutation_nonce_replayed" | "mutation_expired" | "mutation_revision_conflict";
};
export declare function validateMutationEnvelope(input: {
    envelope: MutationEnvelope;
    requiredScope: string;
    currentRevision: number;
    now: number;
    maxAgeMs: number;
    usedNonces: ReadonlySet<string>;
}): {
    ok: boolean;
    diagnostics: MutationEnvelopeDiagnostic[];
};
export type ProjectionAudience = "user" | "field_debug" | "audit";
export declare function projectCapabilityAudience(input: {
    audience: ProjectionAudience;
    authorized: boolean;
    source: Readonly<Record<string, unknown>>;
}): Record<string, unknown>;
export declare function createRuntimeConfigSnapshot(externalConstants: Readonly<Record<string, string | undefined>>, allowlist: readonly string[]): Readonly<Record<string, string>>;
export declare function rejectRuntimeEnvironmentMutation(key: string): never;
//# sourceMappingURL=capability-security-boundary.d.ts.map