export const PRODUCT_PARAMETER_KEYS = [
    "main_agent_name",
    "prompt_improvement_approval",
    "yeonjang_permissions",
    "sub_agent_delegation",
    "agent_memory",
    "general_chat_memory",
];
const CANONICAL_PROMPT_BY_PARAMETER = {
    main_agent_name: "prompts/identity.md",
    prompt_improvement_approval: "prompts/prompt_improvement.md",
    yeonjang_permissions: "prompts/yeonjang_policy.md",
    sub_agent_delegation: "prompts/sub_agent_delegation.md",
    agent_memory: "prompts/memory_policy.md",
    general_chat_memory: "prompts/memory_policy.md",
};
function exact(value) {
    return value?.trim() ?? "";
}
function validSource(source) {
    return Boolean(exact(source.sourceRef) && exact(source.revisionFingerprint) && exact(source.evidenceRef));
}
function cloneSource(source) {
    return Object.freeze({
        sourceRef: exact(source.sourceRef),
        revisionFingerprint: exact(source.revisionFingerprint),
        evidenceRef: exact(source.evidenceRef),
    });
}
export function authorizeProductParameterChange(input) {
    if (!PRODUCT_PARAMETER_KEYS.includes(input.parameterKey)) {
        return { status: "blocked", reasonCode: "parameter_key_invalid" };
    }
    const previousValueFingerprint = exact(input.previousValueFingerprint);
    const nextValueFingerprint = exact(input.nextValueFingerprint);
    if (!previousValueFingerprint || !nextValueFingerprint) {
        return { status: "blocked", reasonCode: "parameter_value_invalid" };
    }
    if (previousValueFingerprint === nextValueFingerprint) {
        return { status: "blocked", reasonCode: "parameter_value_unchanged" };
    }
    if (!(input.decisionActorType === "user" || input.decisionActorType === "admin")
        || !exact(input.decisionActorRef) || !exact(input.approvalRef)
        || !Number.isSafeInteger(input.decidedAt) || input.decidedAt < 0) {
        return { status: "blocked", reasonCode: "decision_approval_invalid" };
    }
    if (!validSource(input.productParameterSource) || !validSource(input.canonicalPromptSource)
        || !validSource(input.testFixture) || !exact(input.revisionFingerprint)) {
        return { status: "blocked", reasonCode: "change_source_invalid" };
    }
    if (exact(input.productParameterSource.sourceRef) !== "packages/core/src/contracts/product-parameters.ts") {
        return { status: "blocked", reasonCode: "change_source_invalid" };
    }
    if (exact(input.canonicalPromptSource.sourceRef) !== CANONICAL_PROMPT_BY_PARAMETER[input.parameterKey]) {
        return { status: "blocked", reasonCode: "canonical_prompt_source_mismatch" };
    }
    if (!/^tests\/.+\.test\.[cm]?[jt]sx?$/u.test(exact(input.testFixture.sourceRef))) {
        return { status: "blocked", reasonCode: "test_fixture_invalid" };
    }
    const revisionFingerprint = exact(input.revisionFingerprint);
    if ([input.productParameterSource, input.canonicalPromptSource, input.testFixture]
        .some((source) => exact(source.revisionFingerprint) !== revisionFingerprint)) {
        return { status: "blocked", reasonCode: "change_revision_mismatch" };
    }
    if (input.runtimeActivation !== "startup_snapshot_only") {
        return { status: "blocked", reasonCode: "runtime_activation_invalid" };
    }
    return {
        status: "authorized",
        receipt: Object.freeze({
            schemaVersion: 1,
            decisionState: "decided",
            parameterKey: input.parameterKey,
            previousValueFingerprint,
            nextValueFingerprint,
            decisionActorType: input.decisionActorType,
            decisionActorRef: exact(input.decisionActorRef),
            approvalRef: exact(input.approvalRef),
            decidedAt: input.decidedAt,
            revisionFingerprint,
            productParameterSource: cloneSource(input.productParameterSource),
            canonicalPromptSource: cloneSource(input.canonicalPromptSource),
            testFixture: cloneSource(input.testFixture),
            runtimeActivation: "startup_snapshot_only",
        }),
    };
}
export async function applyAuthorizedProductParameterChange(input) {
    if (input.decision.status !== "authorized") {
        return { status: "blocked", reasonCode: "product_parameter_change_not_authorized" };
    }
    const result = await input.apply(input.decision.receipt);
    return { status: "applied", receipt: input.decision.receipt, result };
}
//# sourceMappingURL=product-parameter-change-governance.js.map