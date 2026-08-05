export declare const IDENTITY_NAME_MUTATION_TARGETS: readonly ["main_agent_name", "user_name"];
export type IdentityNameMutationTarget = typeof IDENTITY_NAME_MUTATION_TARGETS[number];
export interface IdentityNameMutationIntentReceipt {
    requestId: string;
    requester: string;
    requesterType: "user" | "administrator";
    target: IdentityNameMutationTarget;
    requestedAt: number;
    expiresAt: number;
}
export type IdentityNameMutationDecision = {
    status: "authorized";
    target: IdentityNameMutationTarget;
    requestId: string;
} | {
    status: "blocked";
    reasonCode: "explicit_name_target_missing" | "name_target_mismatch" | "request_expired";
};
export declare function authorizeIdentityNameMutation(input: {
    requestedTarget?: IdentityNameMutationTarget;
    intent?: IdentityNameMutationIntentReceipt;
    now: number;
}): IdentityNameMutationDecision;
export declare function executeAuthorizedIdentityNameMutation<T>(input: {
    decision: IdentityNameMutationDecision;
    writerTarget: IdentityNameMutationTarget;
    write: (target: IdentityNameMutationTarget) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=identity-name-mutation-authorization.d.ts.map