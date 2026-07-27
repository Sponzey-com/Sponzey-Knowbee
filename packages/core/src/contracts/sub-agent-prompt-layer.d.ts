export type SubAgentPromptLayerKind = "global_system" | "common_policy" | "agent_system" | "explicit_user_traits" | "work_handoff";
export interface SubAgentPromptLayer {
    kind: SubAgentPromptLayerKind;
    sourceRef: string;
    owner: "platform" | string;
}
export type ProtectedAgentTraitPolicy = "safety" | "permission" | "memory_isolation" | "response_language" | "identity" | "delegation";
export interface ExplicitAgentTraitInput {
    agentName: string;
    provenance: "explicit_user_input";
    sourceRef: string;
    text: string;
    protectedPolicyEffects: Record<ProtectedAgentTraitPolicy, "preserve">;
}
export interface ValidatedSubAgentPromptLayerStack {
    ok: true;
    orderedKinds: SubAgentPromptLayerKind[];
    explicitTraits: ExplicitAgentTraitInput | undefined;
}
export interface OrdinarySubAgentConfigurationInput {
    agentId: string;
    agentName: string;
    role: string;
    capabilities: string[];
    modelPolicy: string;
    toolPolicy: string;
    status: string;
    personality?: string;
    promptStack?: SubAgentPromptLayer[];
}
export interface OrdinarySubAgentConfiguration {
    agentName: string;
    role: string;
    capabilities: string[];
    modelPolicy: string;
    toolPolicy: string;
    status: string;
}
export declare function validateSubAgentPromptLayerStack(input: {
    agentName: string;
    layers: SubAgentPromptLayer[];
    explicitTraits?: ExplicitAgentTraitInput;
}): ValidatedSubAgentPromptLayerStack;
export declare function projectOrdinarySubAgentConfiguration(input: OrdinarySubAgentConfigurationInput): OrdinarySubAgentConfiguration;
//# sourceMappingURL=sub-agent-prompt-layer.d.ts.map