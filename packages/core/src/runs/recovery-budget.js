export function createRecoveryBudgetUsage() {
    return {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
    };
}
export function getRecoveryBudgetLimit(kind, maxDelegationTurns) {
    void kind;
    const policy = resolveRecoveryBudgetPolicy(maxDelegationTurns);
    return policy.kind === "bounded" ? policy.maxRetries : 0;
}
export function resolveRecoveryBudgetPolicy(maxDelegationTurns) {
    void maxDelegationTurns;
    return {
        kind: "strategy_guarded",
        policyVersion: "recovery.changed-strategy-guarded:v3",
    };
}
export function getRecoveryBudgetState(params) {
    const used = params.usage[params.kind] ?? 0;
    const policy = resolveRecoveryBudgetPolicy(params.maxDelegationTurns);
    const limit = policy.kind === "bounded" ? policy.maxRetries : 0;
    return {
        kind: params.kind,
        used,
        limit,
        remaining: limit > 0 ? Math.max(0, limit - used) : 0,
        policy,
    };
}
export function canConsumeRecoveryBudget(params) {
    const state = getRecoveryBudgetState(params);
    if (state.policy.kind !== "bounded")
        return true;
    return state.used < state.limit;
}
export function consumeRecoveryBudget(params) {
    const state = getRecoveryBudgetState(params);
    if (state.policy.kind === "bounded" && state.used >= state.policy.maxRetries) {
        return state;
    }
    params.usage[params.kind] = state.used + 1;
    return getRecoveryBudgetState(params);
}
export function formatRecoveryBudgetProgress(state) {
    return `신호 ${state.used}`;
}
export function getSubSessionRevisionBudgetLimit(budgetClass = "default") {
    void budgetClass;
    return Number.MAX_SAFE_INTEGER;
}
export function canRetrySubSessionRevision(params) {
    void params.budgetClass;
    if (params.repeatedFailure)
        return false;
    return true;
}
//# sourceMappingURL=recovery-budget.js.map