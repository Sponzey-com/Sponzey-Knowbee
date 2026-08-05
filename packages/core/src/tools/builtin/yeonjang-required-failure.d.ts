import type { ToolResult } from "../types.js";
export type YeonjangRequiredFailureReasonCode = "method_unavailable_or_disconnected" | "core_local_path_forbidden";
export interface YeonjangRequiredFailureInput {
    method?: string;
    reason?: string;
    reasonCode?: YeonjangRequiredFailureReasonCode;
    userNextAction?: string;
}
export declare function buildYeonjangRequiredFailure(input: YeonjangRequiredFailureInput): ToolResult;
//# sourceMappingURL=yeonjang-required-failure.d.ts.map