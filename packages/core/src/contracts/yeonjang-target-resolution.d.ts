import type { YeonjangTargetSelector } from "./yeonjang-target.js";
import { type YeonjangIdentityBoundarySnapshot, type YeonjangUserFacingInstanceIdentity } from "./yeonjang-identity-boundary.js";
export type ExactYeonjangSelector = Extract<YeonjangTargetSelector, {
    type: "instance_id" | "instance_alias" | "call_name";
}>;
export type YeonjangExactTargetStatus = "resolved" | "not_found" | "ambiguous" | "unavailable";
export interface YeonjangExactTargetReceipt {
    schemaVersion: 1;
    receiptId: string;
    snapshotFingerprint: string;
    selectorFingerprint: string;
    targetInstanceId: string;
}
export interface YeonjangTargetClarificationCandidate extends YeonjangUserFacingInstanceIdentity {
}
export type YeonjangExactTargetDecision = {
    status: "resolved";
    reasonCode: "exact_target_resolved";
    receipt: YeonjangExactTargetReceipt;
} | {
    status: "not_found";
    reasonCode: "target_not_found";
    candidates: [];
} | {
    status: "ambiguous";
    reasonCode: "target_ambiguous";
    candidates: YeonjangTargetClarificationCandidate[];
} | {
    status: "unavailable";
    reasonCode: "target_offline" | "target_degraded" | "target_untrusted";
    candidates: YeonjangTargetClarificationCandidate[];
};
export declare function resolveExactYeonjangTarget(input: {
    selector: ExactYeonjangSelector;
    snapshot: YeonjangIdentityBoundarySnapshot;
    maxAgeMs: number;
}): YeonjangExactTargetDecision;
export declare function authorizeExactYeonjangTarget(input: {
    receipt: YeonjangExactTargetReceipt | undefined;
    selector: ExactYeonjangSelector;
    snapshot: YeonjangIdentityBoundarySnapshot;
    maxAgeMs: number;
}): string;
//# sourceMappingURL=yeonjang-target-resolution.d.ts.map