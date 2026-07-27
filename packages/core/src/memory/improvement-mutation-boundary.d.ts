export declare const IMPROVEMENT_MUTATION_TARGET_KINDS: readonly ["file", "hidden_runtime_instruction", "environment_lookup", "in_memory_patch", "compiled_artifact", "provider_configuration", "runtime_environment", "yeonjang_permission_policy"];
export type ImprovementMutationTargetKind = typeof IMPROVEMENT_MUTATION_TARGET_KINDS[number];
export type ImprovementMutationSourceAuthorization = "prompt_source" | "harness_approval_policy" | "harness_state_machine";
export interface ImprovementRuntimeSnapshot {
    snapshotId: string;
    capturedAt: number;
}
export interface ImprovementMutationTargetReceipt {
    targetKind: ImprovementMutationTargetKind;
    requestedRef: string;
    canonicalWorkspacePath?: string;
    withinWorkspace: boolean;
    traversedSymlink: boolean;
    sourceAuthorization: ImprovementMutationSourceAuthorization;
}
export declare const PROTECTED_COMMON_PROMPT_SOURCES: readonly [{
    readonly policyKind: "system";
    readonly sourceRef: "prompts/system.md";
}, {
    readonly policyKind: "safety";
    readonly sourceRef: "prompts/recovery_policy.md";
}, {
    readonly policyKind: "tool";
    readonly sourceRef: "prompts/tool_policy.md";
}, {
    readonly policyKind: "yeonjang";
    readonly sourceRef: "prompts/yeonjang_policy.md";
}];
export type ProtectedCommonPromptPolicyKind = typeof PROTECTED_COMMON_PROMPT_SOURCES[number]["policyKind"];
export interface CommonPromptPolicyApprovalReceipt {
    schemaVersion: 1;
    approvalId: string;
    approvedBy: string;
    approvedByType: "user" | "administrator";
    scope: "common_prompt_policy_mutation";
    sourceRef: string;
    risk: "high";
    issuedAt: number;
    expiresAt: number;
}
export type ImprovementMutationDecision = {
    status: "authorized";
    target: ImprovementMutationTargetReceipt;
    runtimeSnapshotId: string;
} | {
    status: "blocked";
    reasonCode: "runtime_snapshot_invalid" | "runtime_mutation_forbidden" | "compiled_artifact_forbidden" | "provider_configuration_forbidden" | "runtime_environment_forbidden" | "yeonjang_permission_policy_forbidden" | "path_receipt_invalid" | "path_escape_forbidden" | "symlink_forbidden" | "application_code_forbidden" | "deployment_script_forbidden" | "lockfile_forbidden" | "common_policy_approval_required" | "common_policy_approval_invalid" | "common_policy_approval_scope_mismatch" | "source_authorization_mismatch";
};
export declare function authorizeImprovementMutation(input: {
    target: ImprovementMutationTargetReceipt;
    runtimeSnapshot: ImprovementRuntimeSnapshot;
    commonPolicyApproval?: CommonPromptPolicyApprovalReceipt;
    now?: number;
}): ImprovementMutationDecision;
export declare function executeAuthorizedImprovementMutation<T>(input: {
    decision: ImprovementMutationDecision;
    mutate: (target: ImprovementMutationTargetReceipt) => Promise<T>;
}): Promise<{
    status: "mutated";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=improvement-mutation-boundary.d.ts.map