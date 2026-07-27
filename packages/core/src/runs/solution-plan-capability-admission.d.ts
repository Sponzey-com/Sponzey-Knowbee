import type { SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js";
import type { CanonicalPlanPolicyInput } from "./canonical-plan-policy.js";
export type SolutionPlanCapabilityAdmissionReasonCode = "capability_admission_invalid" | "capability_admission_outside_snapshot" | "capability_admission_target_ambiguous" | "capability_admission_target_unavailable" | "capability_admission_approval_required" | "capability_admission_denied";
export interface SolutionPlanCapabilityAdmissionEntry {
    stepId: string;
    capabilityRef: string;
    capabilityId: string;
    targetId: string;
}
export interface SolutionPlanCapabilityAdmissionDescriptor {
    runId: string;
    receiptId: string;
    solutionPlanReceiptId: string;
    policyReceiptId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    outcome: "allowed" | "approval_required";
    approvalRequiredCapabilityIds: string[];
    entries: SolutionPlanCapabilityAdmissionEntry[];
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
interface PersistedCapabilityAdmissionReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
}
export declare function buildSolutionPlanCapabilityAdmission(input: {
    runId: string;
    solutionPlanReceiptId: string;
    policyReceiptId: string;
    capabilitySnapshot: CanonicalPlanPolicyInput["capabilitySnapshot"];
    selections: SolutionPlanCapabilitySelection[];
    targetId?: string | undefined;
    approvedCapabilityIds: string[];
}): {
    ok: true;
    descriptor: SolutionPlanCapabilityAdmissionDescriptor;
} | {
    ok: false;
    reasonCode: SolutionPlanCapabilityAdmissionReasonCode;
};
export declare function recordSolutionPlanCapabilityAdmission(descriptor: SolutionPlanCapabilityAdmissionDescriptor, dependencies: {
    issueReceipt: (receipt: {
        receiptId: string;
        workId: string;
        kind: "policy";
        evidenceFingerprint: string;
        evidenceRefs: string[];
    }) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedCapabilityAdmissionReceipt | undefined;
}): {
    ok: true;
    capabilityAdmissionReceiptId: string;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=solution-plan-capability-admission.d.ts.map