import type { CapabilityRiskLevel } from "../contracts/sub-agent-orchestration.js";
export interface SkillCatalogRow {
    skill_id: string;
    status: "enabled" | "disabled" | "archived";
    display_name: string;
    risk?: CapabilityRiskLevel | null;
    metadata_json: string | null;
    updated_at: number;
}
export interface SkillBindingRow {
    catalog_id: string;
    status: "enabled" | "disabled" | "archived";
    updated_at?: number;
}
export interface SkillCatalogQuery {
    limit?: number;
    cursor?: string;
    search?: string;
    sourceKind?: "builtin" | "local";
    runtimeStatus?: "active" | "inactive";
    boundOnly?: boolean;
}
export declare function buildSkillCatalogPage(input: {
    rows: readonly SkillCatalogRow[];
    bindings: readonly SkillBindingRow[];
    query: SkillCatalogQuery;
    observedAt: number;
    publicRefForSkillId: (skillId: string) => string;
}): {
    items: {
        validationStatus: "valid";
        runtimeStatus: "active" | "inactive";
        bindingCount: number;
        revision: number;
        risk?: CapabilityRiskLevel;
        skillRef: string;
        displayName: string;
        description: string;
        sourceKind: "local" | "builtin";
    }[];
    nextCursor: string | null;
    revision: number;
    observedAt: number;
};
//# sourceMappingURL=skill-catalog-query.d.ts.map