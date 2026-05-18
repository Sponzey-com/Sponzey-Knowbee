import type { AgentTool } from "../types.js";
import { type YeonjangTargetedToolParams } from "./yeonjang-target.js";
interface YeonjangCameraListParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangCameraCaptureParams extends YeonjangTargetedToolParams {
    deviceId?: string;
    outputPath?: string;
    inlineBase64?: boolean;
    timeoutSec?: number;
}
export declare const yeonjangCameraListTool: AgentTool<YeonjangCameraListParams>;
export declare const yeonjangCameraCaptureTool: AgentTool<YeonjangCameraCaptureParams>;
export {};
//# sourceMappingURL=yeonjang.d.ts.map