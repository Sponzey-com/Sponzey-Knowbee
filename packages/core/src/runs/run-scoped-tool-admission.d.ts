import type { CapabilitySelectionCandidateContext, LlmCapabilitySelectionAdmission } from "../contracts/llm-capability-selection.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import type { CapabilitySelectionSkillBinding, CapabilitySelectionSkillDefinition } from "./capability-selection-snapshot.js";
import type { InstructionSkillRunSnapshot } from "./instruction-skill-snapshot.js";
import type { SolutionPlanCapabilityAdmissionDescriptor } from "./solution-plan-capability-admission.js";
type SelectedCapabilityAdmission = Extract<LlmCapabilitySelectionAdmission, {
    status: "allowed" | "approval_required";
}>;
interface AdmittedCapabilityExecutionScopeBase {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly ownerAgentId: string;
    readonly receiptId: string;
    readonly capabilitySnapshotFingerprint: `sha256:${string}`;
    readonly selectedCapabilityId: string;
    readonly selectedCapabilityIds?: readonly string[];
    readonly selectedTargetIds?: readonly string[];
    readonly approvalRequiredCapabilityIds?: readonly string[];
}
export type AdmittedCapabilityExecutionScope = (AdmittedCapabilityExecutionScopeBase & {
    readonly kind: "tool_bundle_skill";
    readonly toolNames: readonly string[];
}) | (AdmittedCapabilityExecutionScopeBase & {
    readonly kind: "instruction_skill";
    readonly toolNames: readonly string[];
    readonly instruction: {
        readonly content: string;
        readonly checksum: `sha256:${string}`;
    };
});
export interface RunScopedInstruction {
    readonly capabilityId: string;
    readonly content: string;
    readonly checksum: `sha256:${string}`;
}
export type AdmittedCapabilityExecutionScopeResult = {
    ok: true;
    scope: AdmittedCapabilityExecutionScope;
} | {
    ok: false;
    reasonCode: "run_scoped_admission_invalid" | "run_scoped_admission_owner_mismatch" | "run_scoped_skill_binding_missing" | "run_scoped_skill_binding_ambiguous" | "run_scoped_skill_binding_invalid" | "run_scoped_skill_definition_missing" | "run_scoped_skill_definition_ambiguous" | "run_scoped_instruction_invalid";
};
export declare function createAdmittedCapabilityExecutionScope(input: {
    runId: string;
    ownerAgentId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    admission: SelectedCapabilityAdmission;
    selectedCandidateContext?: CapabilitySelectionCandidateContext | null | undefined;
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings?: readonly CapabilitySelectionSkillBinding[] | undefined;
}): AdmittedCapabilityExecutionScopeResult;
export declare function createPolicyCapabilityExecutionScope(input: {
    runId: string;
    ownerAgentId: string;
    policyReceiptId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    toolNames: readonly string[];
}): AdmittedCapabilityExecutionScopeResult;
export declare function createPolicyMethodCapabilityExecutionScope(input: {
    runId: string;
    ownerAgentId: string;
    policyReceiptId: string;
    capabilitySnapshotFingerprint: `sha256:${string}`;
    methodToolNames: readonly string[];
    availableToolNames: readonly string[];
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
}): AdmittedCapabilityExecutionScopeResult;
export declare function createSolutionPlanCapabilityExecutionScope(input: {
    descriptor: SolutionPlanCapabilityAdmissionDescriptor;
    ownerAgentId: string;
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
    instructionSkills?: readonly InstructionSkillRunSnapshot[] | undefined;
}): AdmittedCapabilityExecutionScopeResult;
export declare function projectRunScopedInstruction(input: {
    scope: AdmittedCapabilityExecutionScope;
    runId: string;
    ownerAgentId: string;
}): RunScopedInstruction | null;
export declare function projectRunScopedToolNames(input: {
    scope: AdmittedCapabilityExecutionScope;
    runId: string;
    ownerAgentId: string;
    availableToolNames: readonly string[];
}): string[];
export declare function dispatchRunScopedTool(input: {
    scope: AdmittedCapabilityExecutionScope;
    runId: string;
    ownerAgentId: string;
    toolName: string;
    params: Record<string, unknown>;
    context: ToolContext;
    dispatcher: Pick<ToolDispatcher, "dispatch" | "get">;
}): Promise<ToolResult>;
export {};
//# sourceMappingURL=run-scoped-tool-admission.d.ts.map