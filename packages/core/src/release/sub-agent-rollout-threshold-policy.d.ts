export type SubAgentRolloutReleaseMode = "limited_beta" | "full_enable";
export interface SubAgentReleaseThresholds {
    duplicateFinalAnswerCount: 0;
    spawnAckP95Ms: number;
    hotRegistrySnapshotP95Ms: number;
    plannerHotPathP95Ms: number;
    firstProgressP95Ms: number;
    restartRecoveryP95Ms: number;
}
export interface SubAgentRolloutThresholdPolicyCandidate {
    schemaVersion: 1;
    policyId: string;
    policyVersion: number;
    releaseMode: SubAgentRolloutReleaseMode;
    thresholds: SubAgentReleaseThresholds;
}
export interface SubAgentRolloutThresholdAuthorizationReceipt {
    schemaVersion: 1;
    authorizationId: string;
    decision: "approved" | "denied" | "revoked";
    actorType: "administrator" | "system";
    actorId: string;
    scope: "sub_agent_rollout_thresholds";
    policyId: string;
    policyVersion: number;
    releaseMode: SubAgentRolloutReleaseMode;
    thresholdSnapshot: SubAgentReleaseThresholds;
    approvedAt: number;
}
export interface SubAgentRolloutThresholdAuthorizationPort {
    resolve(candidate: Readonly<SubAgentRolloutThresholdPolicyCandidate>): SubAgentRolloutThresholdAuthorizationReceipt | undefined;
}
export type SubAgentRolloutThresholdPolicyValidationResult = {
    status: "valid";
    candidate: Readonly<SubAgentRolloutThresholdPolicyCandidate>;
} | {
    status: "baseline_only";
    reasonCodes: string[];
};
export interface ActiveSubAgentRolloutThresholdPolicy {
    readonly candidate: Readonly<SubAgentRolloutThresholdPolicyCandidate>;
    readonly authorization: Readonly<SubAgentRolloutThresholdAuthorizationReceipt>;
}
export declare function validateSubAgentRolloutThresholdPolicy(candidate: SubAgentRolloutThresholdPolicyCandidate): SubAgentRolloutThresholdPolicyValidationResult;
export declare function activateSubAgentRolloutThresholdPolicy(input: {
    candidate: SubAgentRolloutThresholdPolicyCandidate;
    authorizationPort: SubAgentRolloutThresholdAuthorizationPort;
}): {
    status: "active";
    policy: ActiveSubAgentRolloutThresholdPolicy;
} | {
    status: "baseline_only";
    reasonCodes: string[];
};
//# sourceMappingURL=sub-agent-rollout-threshold-policy.d.ts.map