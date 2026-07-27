import type { TaskIntakeResult } from "../agent/intake.js";
import type { OrchestrationRegistrySnapshot } from "../orchestration/registry.js";
import type { AnyTool, ToolContext } from "../tools/types.js";
import { type CapabilityRuntimeHealthObservation, type YeonjangAgentBindingObservation } from "./canonical-capability-snapshot.js";
import { type CanonicalPlanPolicyInput, type CanonicalPlanPolicyReceiptDescriptor } from "./canonical-plan-policy.js";
export type CanonicalIntakePlanPolicyResult = {
    ok: true;
    input: CanonicalPlanPolicyInput;
    descriptor: CanonicalPlanPolicyReceiptDescriptor;
} | {
    ok: false;
    reasonCode: string;
    input?: CanonicalPlanPolicyInput | undefined;
    decision?: import("./canonical-plan-policy.js").CanonicalPlanPolicyDecision | undefined;
};
interface PersistedPolicyReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
export declare function recordCanonicalIntakePlanPolicy(descriptor: CanonicalPlanPolicyReceiptDescriptor, dependencies: {
    issueReceipt: (input: Omit<CanonicalPlanPolicyReceiptDescriptor, "runId">) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedPolicyReceipt | undefined;
    applyPolicyTransition: (input: {
        runId: string;
        workId: string;
        receiptRef: string;
    }) => {
        status: string;
        reasonCode?: string | undefined;
    };
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildCanonicalIntakePlanPolicy(input: {
    runId: string;
    rootAgentId?: string | undefined;
    intake: TaskIntakeResult;
    registry: OrchestrationRegistrySnapshot;
    tools: AnyTool[];
    source?: ToolContext["source"];
    snapshotAt?: number;
    runtimeHealthObservations?: CapabilityRuntimeHealthObservation[];
    yeonjangAgentBindings?: YeonjangAgentBindingObservation[];
    approvedCapabilityIds?: string[] | undefined;
}): CanonicalIntakePlanPolicyResult;
export {};
//# sourceMappingURL=canonical-intake-plan-policy.d.ts.map