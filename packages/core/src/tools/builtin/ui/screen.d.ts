/**
 * Screen capture tools.
 * Uses @nut-tree/nut-js when available, falls back to platform CLI tools.
 */
import type { AgentTool } from "../../types.js";
import { type YeonjangTargetedToolParams } from "../yeonjang-target.js";
interface ScreenCaptureParams extends YeonjangTargetedToolParams {
    display?: number | string;
}
interface ScreenFindTextParams extends YeonjangTargetedToolParams {
    text: string;
}
export declare const screenCaptureTool: AgentTool<ScreenCaptureParams>;
export declare const screenFindTextTool: AgentTool<ScreenFindTextParams>;
export {};
//# sourceMappingURL=screen.d.ts.map