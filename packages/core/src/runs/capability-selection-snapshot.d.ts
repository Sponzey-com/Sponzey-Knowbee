import type { CapabilitySelectionRisk, CapabilitySelectionSnapshot } from "../contracts/llm-capability-selection.js";
import type { CanonicalCapabilitySnapshotProjection } from "./canonical-capability-snapshot.js";
import type { InstructionSkillRunSnapshot, InstructionSkillSnapshotFinding } from "./instruction-skill-snapshot.js";
export interface CapabilitySelectionSkillDefinition {
    capabilityId: string;
    toolNames: readonly string[];
}
export interface CapabilitySelectionSkillBinding {
    capabilityId: string;
    targetId: string;
    status: "enabled" | "disabled" | "archived";
    risk: CapabilitySelectionRisk;
    sourceSupported: boolean;
    toolNames?: readonly string[] | undefined;
}
export declare function projectCapabilitySelectionSnapshot(input: {
    snapshotId: string;
    ownerAgentId: string;
    canonicalSnapshot: CanonicalCapabilitySnapshotProjection;
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
    instructionSkills?: readonly InstructionSkillRunSnapshot[] | undefined;
    instructionSkillFindings?: readonly InstructionSkillSnapshotFinding[] | undefined;
}): CapabilitySelectionSnapshot;
//# sourceMappingURL=capability-selection-snapshot.d.ts.map