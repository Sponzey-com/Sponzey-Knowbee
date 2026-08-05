import { projectUserFacingAgentIdentity } from "./user-facing-agent-identity.js";
const WITHOUT_TRAITS = [
    "global_system",
    "common_policy",
    "agent_system",
    "work_handoff",
];
const WITH_TRAITS = [
    "global_system",
    "common_policy",
    "agent_system",
    "explicit_user_traits",
    "work_handoff",
];
const PROTECTED_POLICIES = [
    "safety",
    "permission",
    "memory_isolation",
    "response_language",
    "identity",
    "delegation",
];
const TYPED_REFERENCE = /^[a-z][a-z0-9_-]*:[^\s]+$/;
const PROTECTED_POLICY_BYPASS = /(?:ignore|override|bypass|disable|weaken|remove|skip).{0,40}(?:safety|permission|memory|language|identity|delegation|previous|system)|share all memory/i;
function requireText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function requireReference(value, field) {
    const normalized = requireText(value, field);
    if (!TYPED_REFERENCE.test(normalized))
        throw new Error(`${field} must be a typed reference.`);
    return normalized;
}
function sameKinds(actual, expected) {
    return actual.length === expected.length && actual.every((kind, index) => kind === expected[index]);
}
function validateTrait(input, agentName) {
    if (input.provenance !== "explicit_user_input") {
        throw new Error("Agent traits require explicit user input provenance.");
    }
    if (requireText(input.agentName, "Trait agent name") !== agentName) {
        throw new Error("Trait owner must match the prompt-layer agent owner.");
    }
    requireReference(input.sourceRef, "Trait source reference");
    const text = requireText(input.text, "Trait text");
    if (PROTECTED_POLICY_BYPASS.test(text)) {
        throw new Error("Agent traits must not bypass a protected policy.");
    }
    for (const policy of PROTECTED_POLICIES) {
        if (input.protectedPolicyEffects[policy] !== "preserve") {
            throw new Error(`Agent trait must preserve ${policy} policy.`);
        }
    }
}
export function validateSubAgentPromptLayerStack(input) {
    const agentName = requireText(input.agentName, "Agent name");
    const orderedKinds = input.layers.map((layer) => layer.kind);
    const hasTraitLayer = orderedKinds.includes("explicit_user_traits");
    const expected = hasTraitLayer ? WITH_TRAITS : WITHOUT_TRAITS;
    if (!sameKinds(orderedKinds, expected)) {
        throw new Error(`Prompt layer order must be ${expected.join(" -> ")}.`);
    }
    for (const layer of input.layers) {
        requireReference(layer.sourceRef, `${layer.kind} layer source reference`);
        const expectedOwner = layer.kind === "global_system" || layer.kind === "common_policy"
            ? "platform"
            : agentName;
        if (layer.owner !== expectedOwner) {
            throw new Error(`${layer.kind} layer owner must be ${expectedOwner}.`);
        }
    }
    if (hasTraitLayer && !input.explicitTraits) {
        throw new Error("An explicit trait layer requires explicit trait input.");
    }
    if (!hasTraitLayer && input.explicitTraits) {
        throw new Error("Explicit trait input requires an explicit trait layer.");
    }
    if (input.explicitTraits) {
        validateTrait(input.explicitTraits, agentName);
        const layer = input.layers.find((candidate) => candidate.kind === "explicit_user_traits");
        if (layer.sourceRef !== input.explicitTraits.sourceRef) {
            throw new Error("Explicit trait layer source must match the trait input source.");
        }
    }
    return {
        ok: true,
        orderedKinds,
        explicitTraits: input.explicitTraits,
    };
}
export function projectOrdinarySubAgentConfiguration(input) {
    const identity = projectUserFacingAgentIdentity(input);
    return {
        agentName: identity.agentName,
        role: requireText(input.role, "Agent role"),
        capabilities: [...new Set(input.capabilities.map((value) => requireText(value, "Capability")))],
        modelPolicy: requireText(input.modelPolicy, "Model policy"),
        toolPolicy: requireText(input.toolPolicy, "Tool policy"),
        status: requireText(input.status, "Agent status"),
    };
}
//# sourceMappingURL=sub-agent-prompt-layer.js.map