export const AMBIGUOUS_PROMPT_PHRASES = [
    "appropriately",
    "as needed",
    "if necessary",
    "later",
    "handle properly",
];
function exact(value) {
    return value?.trim() ?? "";
}
function blocked(reasonCode, subjectId) {
    return subjectId
        ? { status: "blocked", reasonCode, subjectId }
        : { status: "blocked", reasonCode };
}
function nonEmptyUnique(values) {
    const normalized = values.map(exact);
    return normalized.length > 0 && normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}
function containsAmbiguousPhrase(value) {
    const normalized = value.trim().toLowerCase();
    return AMBIGUOUS_PROMPT_PHRASES.some((phrase) => normalized.includes(phrase));
}
export function validatePromptRuleClarity(rule) {
    if (!exact(rule.ruleId) || !exact(rule.moduleId) || !exact(rule.actor) || !exact(rule.condition)
        || !nonEmptyUnique(rule.allowedActions) || !nonEmptyUnique(rule.prohibitedActions)
        || !nonEmptyUnique(rule.completionCriteria)) {
        return blocked("prompt_rule_invalid", exact(rule.ruleId));
    }
    const statements = [
        rule.actor,
        rule.condition,
        ...rule.allowedActions,
        ...rule.prohibitedActions,
        ...rule.completionCriteria,
    ];
    if (statements.some(containsAmbiguousPhrase)) {
        return { status: "blocked", reasonCode: "prompt_rule_ambiguous", subjectId: rule.ruleId };
    }
    return { status: "authorized", moduleIds: [rule.moduleId], responsibilityIds: [] };
}
export function validateCanonicalPromptUses(input) {
    const owners = new Map();
    for (const owner of input.owners) {
        const responsibilityId = exact(owner.responsibilityId);
        const ownerModuleId = exact(owner.ownerModuleId);
        if (!responsibilityId || !ownerModuleId || owners.has(responsibilityId)) {
            return blocked("canonical_owner_invalid", responsibilityId);
        }
        owners.set(responsibilityId, ownerModuleId);
    }
    for (const use of input.uses) {
        const responsibilityId = exact(use.responsibilityId);
        const moduleId = exact(use.moduleId);
        const ownerModuleId = owners.get(responsibilityId);
        if (!ownerModuleId || !moduleId) {
            return blocked("canonical_responsibility_unknown", responsibilityId);
        }
        if (use.mode === "definition") {
            if (moduleId !== ownerModuleId || exact(use.referencedOwnerModuleId)) {
                return { status: "blocked", reasonCode: "canonical_definition_owner_mismatch", subjectId: responsibilityId };
            }
        }
        else if (moduleId === ownerModuleId || exact(use.referencedOwnerModuleId) !== ownerModuleId) {
            return { status: "blocked", reasonCode: "canonical_reference_owner_mismatch", subjectId: responsibilityId };
        }
    }
    return {
        status: "authorized",
        moduleIds: [...new Set(input.uses.map((use) => use.moduleId))],
        responsibilityIds: [...new Set(input.uses.map((use) => use.responsibilityId))],
    };
}
export function authorizePromptComposition(input) {
    const moduleIds = new Set();
    const ruleIds = new Set();
    const definitionIds = new Set();
    for (const module of input.modules) {
        const moduleId = exact(module.moduleId);
        if (!moduleId || moduleIds.has(moduleId)) {
            return blocked("prompt_module_duplicate", moduleId);
        }
        moduleIds.add(moduleId);
        for (const rule of module.rules) {
            if (rule.moduleId !== moduleId)
                return { status: "blocked", reasonCode: "prompt_rule_invalid", subjectId: rule.ruleId };
            const clarity = validatePromptRuleClarity(rule);
            if (clarity.status === "blocked")
                return clarity;
            if (ruleIds.has(rule.ruleId))
                return { status: "blocked", reasonCode: "prompt_rule_duplicate", subjectId: rule.ruleId };
            ruleIds.add(rule.ruleId);
        }
        for (const use of module.responsibilities) {
            if (use.moduleId !== moduleId)
                return { status: "blocked", reasonCode: "canonical_reference_owner_mismatch", subjectId: use.responsibilityId };
            if (use.mode === "definition") {
                if (definitionIds.has(use.responsibilityId)) {
                    return { status: "blocked", reasonCode: "canonical_definition_duplicate", subjectId: use.responsibilityId };
                }
                definitionIds.add(use.responsibilityId);
            }
        }
    }
    const ownership = validateCanonicalPromptUses({
        owners: input.owners,
        uses: input.modules.flatMap((module) => module.responsibilities),
    });
    if (ownership.status === "blocked")
        return ownership;
    return { status: "authorized", moduleIds: [...moduleIds], responsibilityIds: [...definitionIds] };
}
export async function composeAuthorizedPrompts(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "composed", result: await input.compose(input.decision) };
}
//# sourceMappingURL=prompt-composition-governance.js.map