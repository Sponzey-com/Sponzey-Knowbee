import type { CapabilityRiskLevel } from "../contracts/sub-agent-orchestration.js";
import type { CapabilitySelectionSkillBinding, CapabilitySelectionSkillDefinition } from "./capability-selection-snapshot.js";
type StoredCapabilityStatus = "enabled" | "disabled" | "archived";
export interface CapabilitySelectionCatalogEntry {
    skillId: string;
    status: StoredCapabilityStatus;
    risk: CapabilityRiskLevel;
    toolNamesJson: string;
    metadataJson?: string | null | undefined;
}
export interface CapabilitySelectionCatalogBinding {
    agentId: string;
    catalogId: string;
    status: StoredCapabilityStatus;
    enabledToolNamesJson?: string | undefined;
    disabledToolNamesJson?: string | undefined;
}
export type CapabilitySelectionCatalogProjection = {
    ok: true;
    skillDefinitions: CapabilitySelectionSkillDefinition[];
    skillBindings: CapabilitySelectionSkillBinding[];
    instructionSkills: CapabilitySelectionInstructionSkill[];
    findings: CapabilitySelectionCatalogFinding[];
} | {
    ok: false;
    reasonCode: "capability_selection_catalog_invalid";
};
export interface CapabilitySelectionInstructionSkill {
    capabilityId: string;
    targetId: string;
    status: StoredCapabilityStatus;
    risk: "safe" | "approval_required" | "denied";
    sourceRef: string;
}
export interface CapabilitySelectionCatalogFinding {
    capabilityId: string;
    reasonCode: "catalog_entry_missing" | "tool_names_invalid" | "tool_scope_invalid" | "skill_kind_metadata_invalid" | "skill_kind_contract_conflict" | "skill_instruction_source_invalid";
}
export declare function projectCapabilitySelectionCatalog(input: {
    ownerAgentId: string;
    catalogEntries: readonly CapabilitySelectionCatalogEntry[];
    bindings: readonly CapabilitySelectionCatalogBinding[];
}): CapabilitySelectionCatalogProjection;
export {};
//# sourceMappingURL=capability-selection-catalog.d.ts.map