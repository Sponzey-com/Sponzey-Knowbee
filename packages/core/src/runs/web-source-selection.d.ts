import { type WebSearchMetadataSnapshot, type WebSourceSelectionAdmission } from "../contracts/web-source-selection.js";
export { createWebSearchMetadataSnapshot, } from "../contracts/web-source-selection.js";
export interface WebSourceSelectionPort {
    selectSources(input: Readonly<{
        requestGoal: string;
        requiredFactKeys: readonly string[];
        snapshot: WebSearchMetadataSnapshot;
        maxSelections: number;
    }>): Promise<unknown>;
}
export declare function selectWebResearchSources(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    snapshot: WebSearchMetadataSnapshot;
    maxSelections?: number;
}>, port: WebSourceSelectionPort): Promise<WebSourceSelectionAdmission>;
//# sourceMappingURL=web-source-selection.d.ts.map