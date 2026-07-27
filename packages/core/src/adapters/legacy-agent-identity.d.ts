export interface LegacyAgentIdentityImport {
    agentName?: unknown;
    displayName?: unknown;
    nickname?: unknown;
}
export declare function canonicalizeLegacyAgentIdentity<T extends Record<string, unknown>>(input: T & LegacyAgentIdentityImport): Omit<T, "agentName" | "displayName" | "nickname" | "normalizedNickname"> & {
    agentName?: string;
};
//# sourceMappingURL=legacy-agent-identity.d.ts.map