import type { ApprovalDecision, ApprovalResolutionReason } from "../events/index.js";
import type { ApprovalOperationBinding, ApprovalRegistryDecisionResult, ApprovalRegistryRow } from "./approval-registry.js";
import { type ApprovedOperationResumeCommand } from "./approved-operation-resume.js";
import type { EnqueueApprovedOperationContinuationResult } from "./approved-operation-continuation.js";
import type { CanonicalApprovalEvent } from "./canonical-approval-transition.js";
export interface ResolveApprovalDecisionCommand {
    readonly approvalId: string;
    readonly runId: string;
    readonly decision: ApprovalDecision;
    readonly decisionBy: string;
    readonly decisionSource: ApprovalResolutionReason;
    readonly now?: number;
}
export type ResolveApprovalDecisionCommandResult = {
    readonly accepted: true;
    readonly row: ApprovalRegistryRow;
    readonly decision: ApprovalDecision;
    readonly resumeCommand?: ApprovedOperationResumeCommand;
    readonly continuationId?: string;
    readonly canonicalOwned: boolean;
} | {
    readonly accepted: false;
    readonly reasonCode: "approval_not_found" | "approval_run_mismatch" | "approval_already_final" | "approval_decision_rejected" | "approval_consumption_rejected" | "approval_operation_binding_invalid" | "approval_continuation_enqueue_rejected" | "canonical_approval_transition_rejected";
};
export interface ResolveApprovalDecisionDependencies {
    readonly loadApproval: (approvalId: string) => ApprovalRegistryRow | undefined;
    readonly resolveDecision: (input: {
        approvalId: string;
        decision: ApprovalDecision;
        decisionBy: string;
        decisionSource: ApprovalResolutionReason;
        now?: number;
    }) => ApprovalRegistryDecisionResult;
    readonly consumeDecision: (approvalId: string, now?: number) => ApprovalRegistryDecisionResult;
    readonly recordCanonicalLifecycle: (input: {
        runId: string;
        approvalId: string;
        event: CanonicalApprovalEvent;
        operationBinding: ApprovalOperationBinding;
    }) => "applied" | "compatibility" | "failed";
    readonly enqueueContinuation: (command: ApprovedOperationResumeCommand, now?: number) => EnqueueApprovedOperationContinuationResult;
}
export declare function resolveApprovalDecisionCommand(command: ResolveApprovalDecisionCommand, dependencies: ResolveApprovalDecisionDependencies): ResolveApprovalDecisionCommandResult;
//# sourceMappingURL=approval-decision-command.d.ts.map