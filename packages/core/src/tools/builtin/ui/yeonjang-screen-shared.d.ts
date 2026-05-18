import { type YeonjangClientOptions } from "../../../yeonjang/mqtt-client.js";
import type { ToolResult } from "../../types.js";
export interface YeonjangScreenCaptureResult {
    output_path?: string;
    file_name?: string;
    file_extension?: string;
    mime_type?: string;
    size_bytes?: number;
    transfer_encoding?: string;
    base64_data?: string;
    message: string;
}
export interface ScreenCaptureFailureDetails {
    via: "yeonjang";
    extensionId?: string;
    stopAfterFailure?: boolean;
    failureKind?: "path_bug" | "timeout" | "remote_failure";
}
export declare const DEFAULT_SCREEN_CAPTURE_TIMEOUT_MS = 60000;
export declare function extensionFromScreenCaptureMimeType(mimeType?: string): string;
export declare function saveInlineScreenCapture(base64: string, mimeType?: string, rootDir?: string): string;
export declare function validateYeonjangScreenCaptureBinaryResult(remote: YeonjangScreenCaptureResult): string;
export declare function yeonjangRequiredFailure(method: string): ToolResult;
export declare function yeonjangCapabilityMatrixRequiredFailure(method: string): ToolResult;
export declare function yeonjangOutputModeFailure(method: string, outputMode: string): ToolResult;
export declare function yeonjangOutputModeUnknownFailure(method: string, outputMode: string): ToolResult;
export declare function preflightYeonjangScreenCapture(options: YeonjangClientOptions): Promise<ToolResult | null>;
export declare function classifyYeonjangScreenCaptureFailure(message: string): {
    code: string;
    output: string;
    details: ScreenCaptureFailureDetails;
};
export declare function captureScreenViaYeonjang(params: {
    options: YeonjangClientOptions;
    display?: number;
}): Promise<{
    base64: string;
    remote: YeonjangScreenCaptureResult;
}>;
export declare function statArtifactSize(filePath: string): number;
//# sourceMappingURL=yeonjang-screen-shared.d.ts.map