export type SkillCatalogKind = "instruction_skill" | "tool_bundle_skill";
export type SkillCatalogKindClassification = {
    ok: true;
    kind: "instruction_skill";
    resolution: "explicit" | "inferred";
    sourceRef: string;
} | {
    ok: true;
    kind: "tool_bundle_skill";
    resolution: "explicit" | "inferred";
    toolNames: string[];
} | {
    ok: false;
    reasonCode: "skill_kind_metadata_invalid" | "skill_kind_contract_conflict" | "skill_instruction_source_invalid" | "skill_tool_names_invalid";
};
export interface SkillCatalogKindInput {
    toolNamesJson: string;
    metadataJson?: string | null | undefined;
}
export interface SkillCatalogReconciliationInput extends SkillCatalogKindInput {
    skillId: string;
}
export type SkillCatalogReconciliationFinding = {
    skillId: string;
    status: "explicit";
    kind: SkillCatalogKind;
    reasonCode: null;
} | {
    skillId: string;
    status: "inferred";
    kind: SkillCatalogKind;
    reasonCode: "legacy_skill_kind_inferred";
} | {
    skillId: string;
    status: "invalid";
    kind: null;
    reasonCode: Exclude<SkillCatalogKindClassification, {
        ok: true;
    }>["reasonCode"];
};
export declare function classifySkillCatalogKind(input: SkillCatalogKindInput): SkillCatalogKindClassification;
export declare function projectSkillCatalogReconciliation(rows: readonly SkillCatalogReconciliationInput[]): SkillCatalogReconciliationFinding[];
//# sourceMappingURL=skill-catalog-kind.d.ts.map