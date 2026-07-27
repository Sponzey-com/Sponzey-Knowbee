import type { AnyTool, ToolContext, ToolResult } from "./types.js";
export declare function executeToolWithSideEffectLedger(input: {
    tool: AnyTool;
    params: Record<string, unknown>;
    ctx: ToolContext;
}): Promise<ToolResult>;
//# sourceMappingURL=side-effect-runtime.d.ts.map