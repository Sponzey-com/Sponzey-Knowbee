import type { ReleaseAdministratorPrincipal } from "./release-administrator.js";
import type { SubAgentRolloutThresholdAuthorizationPort, SubAgentRolloutThresholdAuthorizationReceipt, SubAgentRolloutThresholdPolicyCandidate } from "./sub-agent-rollout-threshold-policy.js";
export type { ReleaseAdministratorPrincipal } from "./release-administrator.js";
export interface ReleasePolicyAuthorizationRecord extends SubAgentRolloutThresholdAuthorizationReceipt {
    authenticationId: string;
}
export interface ReleasePolicyAuthorizationBinding {
    scope: "sub_agent_rollout_thresholds";
    policyId: string;
    policyVersion: number;
    releaseMode: SubAgentRolloutThresholdPolicyCandidate["releaseMode"];
}
export interface ReleasePolicyAuthorizationRepository {
    append(record: Readonly<ReleasePolicyAuthorizationRecord>): {
        status: "stored" | "duplicate_id";
    };
    findLatest(binding: Readonly<ReleasePolicyAuthorizationBinding>): Readonly<ReleasePolicyAuthorizationRecord> | undefined;
}
export interface ReleaseRolloutPolicySelector {
    policyId: string;
    policyVersion: number;
    releaseMode: SubAgentRolloutThresholdPolicyCandidate["releaseMode"];
}
export type SelectedReleaseRolloutThresholdPolicy = {
    status: "selected";
    candidate: Readonly<SubAgentRolloutThresholdPolicyCandidate>;
    authorizationPort: SubAgentRolloutThresholdAuthorizationPort;
};
export declare function selectReleaseRolloutThresholdPolicy(input: {
    selector: ReleaseRolloutPolicySelector;
    repository: ReleasePolicyAuthorizationRepository;
}): SelectedReleaseRolloutThresholdPolicy | {
    status: "baseline_only";
    reasonCodes: string[];
};
export declare function authorizeSubAgentRolloutThresholdPolicy(input: {
    candidate: SubAgentRolloutThresholdPolicyCandidate;
    decision: ReleasePolicyAuthorizationRecord["decision"];
    principal: ReleaseAdministratorPrincipal;
    authorizationId: string;
    decidedAt: number;
    repository: ReleasePolicyAuthorizationRepository;
}): {
    status: "recorded";
    record: Readonly<ReleasePolicyAuthorizationRecord>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function createSubAgentRolloutThresholdAuthorizationPort(repository: ReleasePolicyAuthorizationRepository): SubAgentRolloutThresholdAuthorizationPort;
//# sourceMappingURL=release-policy-authorization.d.ts.map