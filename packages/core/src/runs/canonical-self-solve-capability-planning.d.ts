import type { TaskIntakeResult } from "../agent/intake.js";
import { type LlmSolutionPlanProvider, type LlmSolutionPlanRepairProvider, type SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js";
import type { CapabilitySelectionSkillBinding, CapabilitySelectionSkillDefinition } from "./capability-selection-snapshot.js";
import type { CanonicalIntakePlanPolicyResult } from "./canonical-intake-plan-policy.js";
import type { InstructionSkillRunSnapshot } from "./instruction-skill-snapshot.js";
import { type AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
import { type SolutionPlanCapabilityAdmissionDescriptor } from "./solution-plan-capability-admission.js";
type AllowedPolicy = Extract<CanonicalIntakePlanPolicyResult, {
    ok: true;
}>;
export type CanonicalSelfSolveCapabilityPlanningResult = {
    ok: true;
    solutionPlanReceiptId: string;
    capabilitySelections: SolutionPlanCapabilitySelection[];
    admission: SolutionPlanCapabilityAdmissionDescriptor;
    scope: AdmittedCapabilityExecutionScope;
} | {
    ok: false;
    reasonCode: string;
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
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
    instructionSkills: readonly InstructionSkillRunSnapshot[];
}): Promise<CanonicalSelfSolveCapabilityPlanningResult>;
export {};
//# sourceMappingURL=canonical-self-solve-capability-planning.d.ts.map