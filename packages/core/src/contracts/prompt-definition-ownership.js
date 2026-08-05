function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
export function evaluatePromptDefinitionOwnership(input) {
    if (!Number.isFinite(input.minimumParserConfidence) || input.minimumParserConfidence < 0 || input.minimumParserConfidence > 1) {
        throw new Error("minimumParserConfidence must be between 0 and 1.");
    }
    const issues = [];
    const add = (code, subjectId) => { issues.push({ code, subjectId }); };
    for (const binding of input.abstractBindings) {
        const term = required(binding.term, "Abstract term");
        const ruleId = required(binding.ruleId, "Abstract term rule ID");
        if (!binding.criterionText.trim() || !binding.testOrFixtureRef.trim())
            add("abstract_criterion_missing", term);
        if (binding.criterionSegmentIndex !== binding.termSegmentIndex + 1)
            add("abstract_criterion_not_immediate", term);
        if (binding.criterionRuleId !== ruleId)
            add("abstract_criterion_rule_mismatch", term);
    }
    for (const sentence of input.sentences) {
        const sentenceId = required(sentence.sentenceId, "Prompt sentence ID");
        required(sentence.ruleId, "Prompt sentence rule ID");
        if (sentence.primaryResponsibilityIds.length !== 1)
            add("sentence_multiple_responsibilities", sentenceId);
        if (sentence.actorRefs.length !== 1 || sentence.conditionRefs.length !== 1 || sentence.completionCriterionRefs.length !== 1) {
            add("sentence_multiple_execution_contexts", sentenceId);
        }
        if (!Number.isFinite(sentence.parserConfidence) || sentence.parserConfidence < input.minimumParserConfidence) {
            add("sentence_parser_confidence_low", sentenceId);
        }
    }
    const ownerByKey = new Map();
    for (const owner of input.owners) {
        const key = required(owner.definitionKey, "Definition key");
        required(owner.canonicalSourceId, "Canonical source ID");
        required(owner.canonicalRuleId, "Canonical rule ID");
        if (ownerByKey.has(key))
            add("definition_duplicate", key);
        ownerByKey.set(key, owner);
    }
    const definitionsByKey = new Map();
    for (const occurrence of input.occurrences) {
        const key = required(occurrence.definitionKey, "Definition occurrence key");
        const sourceId = required(occurrence.sourceId, "Definition occurrence source ID");
        const owner = ownerByKey.get(key);
        if (!owner) {
            add("definition_key_unknown", key);
            continue;
        }
        if (occurrence.occurrenceKind === "definition") {
            required(occurrence.bodyFingerprint ?? "", "Definition body fingerprint");
            const list = definitionsByKey.get(key) ?? [];
            list.push(occurrence);
            definitionsByKey.set(key, list);
            if (sourceId !== owner.canonicalSourceId)
                add("definition_owner_mismatch", key);
        }
        else if (occurrence.referencedRuleId !== owner.canonicalRuleId || sourceId === owner.canonicalSourceId) {
            add("canonical_reference_invalid", key);
        }
    }
    for (const [key, owner] of ownerByKey) {
        const definitions = definitionsByKey.get(key) ?? [];
        if (!definitions.some((item) => item.sourceId === owner.canonicalSourceId))
            add("canonical_definition_missing", key);
        if (definitions.length > 1)
            add("definition_duplicate", key);
    }
    const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}`, issue])).values()];
    return uniqueIssues.length > 0 ? { status: "blocked", issues: uniqueIssues } : { status: "eligible", definitionKeys: [...ownerByKey.keys()] };
}
export async function writeOwnershipEligiblePrompt(input) {
    if (input.decision.status !== "eligible")
        return input.decision;
    return { status: "written", result: await input.write(input.decision) };
}
//# sourceMappingURL=prompt-definition-ownership.js.map