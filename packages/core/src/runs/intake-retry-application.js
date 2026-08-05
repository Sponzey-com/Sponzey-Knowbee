import { consumeRecoveryBudget, formatRecoveryBudgetProgress, } from "./recovery-budget.js";
import { applyTerminalApplication } from "./terminal-application.js";
import { evaluateCanonicalRecoveryStrategyAdmission } from "./canonical-recovery-strategy-admission.js";
const defaultModuleDependencies = {
    applyTerminalApplication,
};
export async function applyIntakeRetryDirective(params, dependencies, moduleDependencies = defaultModuleDependencies) {
    const admission = params.directive.recoveryAdmission;
    const strategyAdmission = admission &&
        /^sha256:[a-f0-9]{64}$/u.test(admission.previousStrategyFingerprint) &&
        /^sha256:[a-f0-9]{64}$/u.test(admission.nextStrategyFingerprint) &&
        admission.changedDimensions.length > 0 &&
        new Set(admission.changedDimensions).size === admission.changedDimensions.length
        ? evaluateCanonicalRecoveryStrategyAdmission({
            attemptedStrategyFingerprints: new Set([
                admission.previousStrategyFingerprint,
            ]),
            nextStrategyFingerprint: admission.nextStrategyFingerprint,
        })
        : { ok: false, reasonCode: "recovery_strategy_unchanged" };
    if (!strategyAdmission.ok) {
        dependencies.appendRunEvent(params.runId, strategyAdmission.reasonCode);
        await moduleDependencies.applyTerminalApplication({
            runId: params.runId,
            sessionId: params.sessionId,
            source: params.source,
            onChunk: params.onChunk,
            application: {
                kind: "stop",
                preview: "",
                summary: params.directive.summary,
                reason: "No materially changed intake strategy was admitted.",
                ...(params.directive.remainingItems
                    ? { remainingItems: params.directive.remainingItems }
                    : {}),
            },
            dependencies: params.finalizationDependencies,
        });
        return { kind: "break" };
    }
    if (params.directive.eventLabel) {
        dependencies.appendRunEvent(params.runId, params.directive.eventLabel);
    }
    dependencies.rememberRunFailure({
        runId: params.runId,
        sessionId: params.sessionId,
        source: params.source,
        summary: params.directive.summary,
        detail: params.directive.reason,
        title: "intake_recovery",
    });
    dependencies.incrementDelegationTurnCount(params.runId, params.directive.summary);
    const interpretationBudgetAfterUse = consumeRecoveryBudget({
        usage: params.recoveryBudgetUsage,
        kind: "interpretation",
        maxDelegationTurns: params.maxTurns,
    });
    dependencies.appendRunEvent(params.runId, `일정 해석 복구 ${formatRecoveryBudgetProgress(interpretationBudgetAfterUse)}`);
    dependencies.setRunStepStatus(params.runId, "executing", "running", params.directive.summary);
    dependencies.updateRunStatus(params.runId, "running", params.directive.summary, true);
    return {
        kind: "retry",
        nextMessage: params.directive.message,
    };
}
//# sourceMappingURL=intake-retry-application.js.map