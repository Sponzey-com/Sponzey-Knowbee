import { type WebChunkSelectionAdmission, type WebChunkSelectionSnapshot } from "../contracts/web-chunk-selection.js";
export { createWebChunkSelectionSnapshot, } from "../contracts/web-chunk-selection.js";
export interface WebChunkSelectionPort {
    selectChunks(input: Readonly<{
        requestGoal: string;
        requiredFactKeys: readonly string[];
        snapshot: WebChunkSelectionSnapshot;
        maxSelections: 1 | 2 | 3;
    }>): Promise<unknown>;
}
export declare function selectWebResearchChunks(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    snapshot: WebChunkSelectionSnapshot;
    maxSelections?: 1 | 2 | 3;
}>, port: WebChunkSelectionPort): Promise<WebChunkSelectionAdmission>;
//# sourceMappingURL=web-chunk-selection.d.ts.map