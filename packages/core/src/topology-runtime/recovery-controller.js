import { loadPromptValue } from "../memory/prompt-fragments.js";
const TOPOLOGY_RECOVERY_REVIEW_SUMMARIES_SOURCE_ID = "topology_recovery_review_summaries_user";
function recoveryReviewSummary(key) {
    const entries = loadPromptValue(TOPOLOGY_RECOVERY_REVIEW_SUMMARIES_SOURCE_ID, {}, { required: true })
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0)
            return [line, ""];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
    const value = new Map(entries).get(key);
    if (!value)
        throw new Error(`topology recovery review summary missing: ${key}`);
    return value;
}
export class RecoveryController {
    input;
    constructor(input) {
        this.input = input;
    }
    reviewSelfExecution() {
        const reviewed = this.input.options?.selfExecutionAttempted
            ?? this.hasState("self_executing");
        return buildSignal({
            kind: "self_execution",
            possible: true,
            reviewed,
            blockingIfUnreviewed: true,
            attemptedStatus: this.input.candidateStatus === "completed" || this.input.candidateStatus === "partial_success"
                ? "succeeded"
                : "failed",
            attemptedReasonCode: "self_execution_attempted",
            unreviewedReasonCode: "self_execution_untried",
            notAvailableReasonCode: "self_execution_untried",
            summary: recoveryReviewSummary(reviewed ? "self_execution_attempted" : "self_execution_untried"),
        });
    }
    reviewRetry() {
        const possible = this.input.options?.requireRetryReview
            ?? this.input.nodeContractSnapshot.recoveryPolicy?.retryAllowed === true;
        const reviewed = this.input.options?.retryAttempted === true;
        return buildSignal({
            kind: "retry",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: "attempted",
            attemptedReasonCode: "retry_attempted",
            unreviewedReasonCode: "retry_untried",
            notAvailableReasonCode: "retry_not_available",
            summary: recoveryReviewSummary(reviewed
                ? "retry_attempted"
                : possible
                    ? "retry_untried"
                    : "retry_not_available"),
        });
    }
    reviewPartialSuccess() {
        const policyAllowsPartial = this.input.nodeContractSnapshot.recoveryPolicy?.partialSuccessAllowed === true
            || this.input.nodeContractSnapshot.failurePolicy?.allowPartialSuccess === true;
        const possible = this.input.options?.requirePartialSuccessReview ?? policyAllowsPartial;
        const reviewed = this.input.options?.partialSuccessChecked
            ?? (this.input.validation !== undefined || this.input.candidateStatus === "partial_success");
        return buildSignal({
            kind: "partial_success_review",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: "attempted",
            attemptedReasonCode: "partial_success_checked",
            unreviewedReasonCode: "partial_success_unchecked",
            notAvailableReasonCode: "partial_success_not_available",
            summary: recoveryReviewSummary(reviewed
                ? "partial_success_checked"
                : possible
                    ? "partial_success_unchecked"
                    : "partial_success_not_available"),
        });
    }
    reviewParentRecovery() {
        const possible = this.input.options?.requireParentRecoveryReview ?? true;
        const reviewed = this.input.options?.parentRecoveryPossibleChecked === true;
        return buildSignal({
            kind: "parent_recovery",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: "attempted",
            attemptedReasonCode: "parent_recovery_checked",
            unreviewedReasonCode: "parent_recovery_unchecked",
            notAvailableReasonCode: "parent_recovery_unchecked",
            summary: recoveryReviewSummary(reviewed ? "parent_recovery_checked" : "parent_recovery_unchecked"),
        });
    }
    hasState(state) {
        return this.input.stateTransitions.some((transition) => transition.state === state);
    }
}
export class RedelegationController {
    input;
    constructor(input) {
        this.input = input;
    }
    reviewChildDelegation() {
        const policyAllowsRedelegation = this.input.nodeContractSnapshot.recoveryPolicy?.redelegationAllowed === true;
        const hasChildCandidates = this.input.nodeContractSnapshot.children.length > 0;
        const possible = this.input.options?.requireChildDelegationReview
            ?? (policyAllowsRedelegation || hasChildCandidates);
        const reviewed = this.input.options?.childDelegationAttempted
            ?? (this.input.childDelegation !== undefined);
        return buildSignal({
            kind: "child_delegation",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: this.statusForChildDelegation(),
            attemptedReasonCode: "child_delegation_attempted",
            unreviewedReasonCode: "child_delegation_untried",
            notAvailableReasonCode: "child_delegation_not_available",
            summary: recoveryReviewSummary(reviewed
                ? "child_delegation_attempted"
                : possible
                    ? "child_delegation_untried"
                    : "child_delegation_not_available"),
        });
    }
    statusForChildDelegation() {
        const summary = this.input.childDelegation;
        if (summary === undefined)
            return "attempted";
        if (summary.status === "dispatched")
            return "succeeded";
        if (summary.status === "blocked")
            return "blocked";
        if (summary.status === "partial")
            return "failed";
        return "skipped";
    }
}
export class FallbackController {
    input;
    constructor(input) {
        this.input = input;
    }
    reviewFallback() {
        const fallbackNodeIds = this.input.nodeContractSnapshot.failurePolicy?.fallbackNodeIds ?? [];
        const possible = this.input.options?.requireFallbackReview
            ?? (this.input.nodeContractSnapshot.recoveryPolicy?.fallbackAllowed === true
                && fallbackNodeIds.length > 0);
        const reviewed = this.input.options?.fallbackAttempted === true;
        return buildSignal({
            kind: "fallback",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: "attempted",
            attemptedReasonCode: "fallback_attempted",
            unreviewedReasonCode: "fallback_untried",
            notAvailableReasonCode: "fallback_not_available",
            summary: recoveryReviewSummary(reviewed
                ? "fallback_attempted"
                : possible
                    ? "fallback_untried"
                    : "fallback_not_available"),
        });
    }
}
export class ToolRecoveryController {
    input;
    constructor(input) {
        this.input = input;
    }
    reviewToolExecution() {
        const allowedToolIds = new Set([
            ...this.input.nodeContractSnapshot.allowedToolIds,
            ...this.input.workOrder.permissionScope.allowedToolIds,
        ]);
        const possible = this.input.options?.requireToolExecutionReview
            ?? allowedToolIds.size > 0;
        const reviewed = this.input.options?.toolExecutionAttempted
            ?? (this.input.toolExecution !== undefined);
        return buildSignal({
            kind: "tool_execution",
            possible,
            reviewed,
            blockingIfUnreviewed: possible,
            attemptedStatus: this.statusForToolExecution(),
            attemptedReasonCode: "tool_execution_attempted",
            unreviewedReasonCode: "tool_execution_untried",
            notAvailableReasonCode: "tool_execution_not_available",
            summary: recoveryReviewSummary(reviewed
                ? "tool_execution_attempted"
                : possible
                    ? "tool_execution_untried"
                    : "tool_execution_not_available"),
        });
    }
    statusForToolExecution() {
        const summary = this.input.toolExecution;
        if (summary === undefined)
            return "attempted";
        if (summary.status === "completed")
            return "succeeded";
        if (summary.status === "failed_candidate")
            return "failed";
        if (summary.status === "partial")
            return "failed";
        return "skipped";
    }
}
export function buildNodeRecoveryReview(input) {
    const recoveryController = new RecoveryController(input);
    const redelegationController = new RedelegationController(input);
    const fallbackController = new FallbackController(input);
    const toolController = new ToolRecoveryController(input);
    const signals = [
        recoveryController.reviewSelfExecution(),
        redelegationController.reviewChildDelegation(),
        toolController.reviewToolExecution(),
        recoveryController.reviewRetry(),
        fallbackController.reviewFallback(),
        recoveryController.reviewPartialSuccess(),
        recoveryController.reviewParentRecovery(),
    ];
    const now = input.now ?? Date.now;
    const attempts = signals.map((signal, index) => signalToAttemptRecord(signal, input.workOrder, now(), index));
    const untriedOptions = signals
        .filter((signal) => !signal.reviewed)
        .map((signal) => `${signal.kind}:${signal.reasonCode}`);
    const blockingUntriedOptions = signals
        .filter((signal) => signal.possible && signal.blockingIfUnreviewed && !signal.reviewed)
        .map((signal) => `${signal.kind}:${signal.reasonCode}`);
    return {
        attempts,
        signals,
        untriedOptions,
        blockingUntriedOptions,
        reasonCodes: signals.map((signal) => signal.reasonCode),
        attempted: {
            self_execution: signalAttempted(signals, "self_execution"),
            child_delegation: signalAttempted(signals, "child_delegation"),
            tool_execution: signalAttempted(signals, "tool_execution"),
            retry: signalAttempted(signals, "retry"),
            fallback: signalAttempted(signals, "fallback"),
            partial_success_review: signalAttempted(signals, "partial_success_review"),
            parent_recovery: signalAttempted(signals, "parent_recovery"),
        },
    };
}
function buildSignal(input) {
    if (!input.possible) {
        return {
            kind: input.kind,
            possible: false,
            reviewed: input.reviewed,
            blockingIfUnreviewed: false,
            status: input.reviewed ? input.attemptedStatus : "skipped",
            reasonCode: input.reviewed ? input.attemptedReasonCode : input.notAvailableReasonCode,
            summary: input.summary,
        };
    }
    return {
        kind: input.kind,
        possible: true,
        reviewed: input.reviewed,
        blockingIfUnreviewed: input.blockingIfUnreviewed,
        status: input.reviewed ? input.attemptedStatus : "skipped",
        reasonCode: input.reviewed ? input.attemptedReasonCode : input.unreviewedReasonCode,
        summary: input.summary,
    };
}
function signalToAttemptRecord(signal, workOrder, at, index) {
    return {
        attemptId: `attempt:${workOrder.workOrderId}:${index + 1}:${signal.kind}`,
        kind: signal.kind,
        status: signal.status,
        at,
        reasonCode: signal.reasonCode,
        summary: signal.summary,
        target: workOrder.to,
    };
}
function signalAttempted(signals, kind) {
    return signals.find((signal) => signal.kind === kind)?.reviewed === true;
}
//# sourceMappingURL=recovery-controller.js.map