function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`${field} must be a positive integer.`);
    return value;
}
function normalizeAction(value) {
    return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
export function evaluatePromptRuleQuality(input) {
    if (input.statements.length === 0)
        throw new Error("At least one prompt rule statement is required.");
    const maxStatementCharacters = positiveInteger(input.limits.maxStatementCharacters, "Maximum statement characters");
    const maxClauses = positiveInteger(input.limits.maxClauses, "Maximum clauses");
    const maxActions = positiveInteger(input.limits.maxActions, "Maximum actions");
    const ruleIds = new Set();
    const issues = [];
    for (const statement of input.statements) {
        const ruleId = required(statement.ruleId, "Prompt rule ID");
        if (ruleIds.has(ruleId))
            throw new Error(`Prompt rule IDs must be unique: ${ruleId}.`);
        ruleIds.add(ruleId);
        const sourceLine = positiveInteger(statement.sourceLine, "Prompt rule source line");
        const add = (code, expected, actual) => {
            issues.push({ ruleId, sourceLine, code, ...(expected === undefined ? {} : { expected }), ...(actual === undefined ? {} : { actual }) });
        };
        if (!statement.actorRef.trim())
            add("actor_missing");
        if (!statement.condition.trim())
            add("condition_missing");
        if (!statement.completionCriterion.trim())
            add("completion_criterion_missing");
        const requiredActions = statement.requiredActions.map(normalizeAction).filter(Boolean);
        const prohibitedActions = statement.prohibitedActions.map(normalizeAction).filter(Boolean);
        const allActions = [...requiredActions, ...prohibitedActions];
        if (allActions.length === 0)
            add("action_missing");
        if (new Set(allActions).size !== allActions.length)
            add("duplicate_action");
        if (requiredActions.some((action) => prohibitedActions.includes(action)))
            add("action_conflict");
        if (allActions.length > maxActions)
            add("action_limit_exceeded", maxActions, allActions.length);
        if (!Number.isSafeInteger(statement.clauseCount) || statement.clauseCount <= 0 || statement.clauseCount > maxClauses) {
            add("clause_limit_exceeded", maxClauses, statement.clauseCount);
        }
        const characters = [statement.actorRef, statement.condition, ...statement.requiredActions, ...statement.prohibitedActions, statement.completionCriterion]
            .reduce((total, value) => total + value.trim().length, 0);
        if (characters > maxStatementCharacters)
            add("statement_too_long", maxStatementCharacters, characters);
    }
    return issues.length > 0 ? { status: "blocked", issues } : { status: "eligible", ruleIds: [...ruleIds] };
}
export async function writeQualityEligiblePromptRules(input) {
    if (input.decision.status !== "eligible")
        return input.decision;
    return { status: "written", result: await input.write(input.decision) };
}
//# sourceMappingURL=prompt-rule-quality.js.map