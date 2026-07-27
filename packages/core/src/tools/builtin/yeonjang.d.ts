import type { AgentTool } from "../types.js";
import { type YeonjangTargetedToolParams } from "./yeonjang-target.js";
interface YeonjangCameraListParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangCameraPermissionStatusParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangCameraCaptureParams extends YeonjangTargetedToolParams {
    deviceId?: string;
    outputPath?: string;
    inlineBase64?: boolean;
    timeoutSec?: number;
}
interface YeonjangFilePathParams extends YeonjangTargetedToolParams {
    path: string;
    timeoutSec?: number;
}
interface YeonjangFileReadParams extends YeonjangFilePathParams {
    maxBytes?: number;
}
interface YeonjangFileSearchParams extends YeonjangFilePathParams {
    query: string;
    maxResults?: number;
    maxPreviewChars?: number;
    maxBytesPerFile?: number;
}
interface YeonjangFileWriteParams extends YeonjangFilePathParams {
    text: string;
    overwrite?: boolean;
}
interface YeonjangFilePatchParams extends YeonjangFilePathParams {
    expectedText: string;
    replacementText: string;
    maxBytes?: number;
}
interface YeonjangDiskPathParams extends YeonjangTargetedToolParams {
    path: string;
    timeoutSec?: number;
}
interface YeonjangProcessListParams extends YeonjangTargetedToolParams {
    limit?: number;
    nameContains?: string;
    timeoutSec?: number;
}
interface YeonjangProcessInfoParams extends YeonjangTargetedToolParams {
    pid: number;
    timeoutSec?: number;
}
interface YeonjangBrowserListParams extends YeonjangTargetedToolParams {
    limit?: number;
    timeoutSec?: number;
}
interface YeonjangBrowserActiveHintParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangBrowserOpenUrlParams extends YeonjangTargetedToolParams {
    url: string;
    timeoutSec?: number;
}
interface YeonjangBrowserFocusParams extends YeonjangTargetedToolParams {
    targetAlias?: string;
    processName?: string;
    title?: string;
    url?: string;
    timeoutSec?: number;
}
interface YeonjangClipboardReadParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangClipboardWriteParams extends YeonjangTargetedToolParams {
    text: string;
    timeoutSec?: number;
}
interface YeonjangNetworkStatusParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
interface YeonjangDeviceStatusParams extends YeonjangTargetedToolParams {
    timeoutSec?: number;
}
export declare const yeonjangCameraListTool: AgentTool<YeonjangCameraListParams>;
export declare const yeonjangCameraPermissionStatusTool: AgentTool<YeonjangCameraPermissionStatusParams>;
export declare const yeonjangFileMetadataTool: AgentTool<YeonjangFilePathParams>;
export declare const yeonjangFileListTool: AgentTool<YeonjangFilePathParams>;
export declare const yeonjangFileReadTool: AgentTool<YeonjangFileReadParams>;
export declare const yeonjangFileSearchTool: AgentTool<YeonjangFileSearchParams>;
export declare const yeonjangFileWriteTool: AgentTool<YeonjangFileWriteParams>;
export declare const yeonjangFilePatchTool: AgentTool<YeonjangFilePatchParams>;
export declare const yeonjangFileDeleteTool: AgentTool<YeonjangFilePathParams>;
export declare const yeonjangDiskInfoTool: AgentTool<YeonjangDiskPathParams>;
export declare const yeonjangDiskUsageTool: AgentTool<YeonjangDiskPathParams>;
export declare const yeonjangDiskExistsTool: AgentTool<YeonjangDiskPathParams>;
export declare const yeonjangProcessListTool: AgentTool<YeonjangProcessListParams>;
export declare const yeonjangProcessInfoTool: AgentTool<YeonjangProcessInfoParams>;
export declare const yeonjangBrowserListTool: AgentTool<YeonjangBrowserListParams>;
export declare const yeonjangBrowserActiveHintTool: AgentTool<YeonjangBrowserActiveHintParams>;
export declare const yeonjangBrowserOpenUrlTool: AgentTool<YeonjangBrowserOpenUrlParams>;
export declare const yeonjangBrowserFocusTool: AgentTool<YeonjangBrowserFocusParams>;
export declare const yeonjangClipboardReadTool: AgentTool<YeonjangClipboardReadParams>;
export declare const yeonjangClipboardWriteTool: AgentTool<YeonjangClipboardWriteParams>;
export declare const yeonjangNetworkStatusTool: AgentTool<YeonjangNetworkStatusParams>;
export declare const yeonjangDeviceStatusTool: AgentTool<YeonjangDeviceStatusParams>;
export declare const yeonjangCameraCaptureTool: AgentTool<YeonjangCameraCaptureParams>;
export {};
//# sourceMappingURL=yeonjang.d.ts.map