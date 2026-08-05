import type { TaskIntakeResult } from "../agent/intake.js";
import { type LlmSolutionPlanProvider, type LlmSolutionPlanRepairProvider, type LlmSolutionPlanCapabilityOption, type SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js";
import type { CapabilitySelectionSkillBinding, CapabilitySelectionSkillDefinition } from "./capability-selection-snapshot.js";
import type { CanonicalIntakePlanPolicyResult } from "./canonical-intake-plan-policy.js";
import type { InstructionSkillRunSnapshot } from "./instruction-skill-snapshot.js";
import { type AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
import { type SolutionPlanCapabilityAdmissionDescriptor } from "./solution-plan-capability-admission.js";
import type { ChannelSource } from "../channels/contracts.js";
type AllowedPolicy = Extract<CanonicalIntakePlanPolicyResult, {
    ok: true;
}>;
export interface CanonicalArtifactDeliveryCapabilityRequirement {
    capabilityRef: string;
    bindingTargetId: string;
    executionTargetId: string;
}
export interface CanonicalCapabilityPlanningMetadata {
    capabilityId: string;
    description: string;
    effectClass: LlmSolutionPlanCapabilityOption["effectClass"];
    channelCapability?: {
        kind: "direct_artifact_delivery";
        channel: ChannelSource;
    };
}
export type CanonicalSelfSolveCapabilityPlanningResult = {
    ok: true;
    solutionPlanReceiptId: string;
    capabilitySelections: SolutionPlanCapabilitySelection[];
    admission: SolutionPlanCapabilityAdmissionDescriptor;
    scope: AdmittedCapabilityExecutionScope;
} | {
    ok: false;
    reasonCode: string;
    repairFailureReasonCode?: string | undefined;
    solutionPlanReceiptId?: string | undefined;
    capabilitySelections?: SolutionPlanCapabilitySelection[] | undefined;
};
export declare function planCanonicalSelfSolveCapabilities(input: {
    runId: string;
    intake: TaskIntakeResult;
    policy: AllowedPolicy;
    ownerAgentId: string;
    ownerAgentName: string;
    requestDiagnosisReceiptId: string;
    requestDiagnosisIssuedAt: number;
    issuedAt: number;
    provider: LlmSolutionPlanProvider;
    repairProvider?: LlmSolutionPlanRepairProvider | undefined;
    artifactDeliveryRequirement?: CanonicalArtifactDeliveryCapabilityRequirement | undefined;
    capabilityMetadata?: readonly CanonicalCapabilityPlanningMetadata[] | undefined;
    source?: ChannelSource | undefined;
    destinationId?: string | undefined;
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
    instructionSkills: readonly InstructionSkillRunSnapshot[];
}): Promise<CanonicalSelfSolveCapabilityPlanningResult>;
export {};
//# sourceMappingURL=canonical-self-solve-capability-planning.d.ts.map