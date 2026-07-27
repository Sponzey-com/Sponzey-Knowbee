import type { ToolContext, ToolResult, ToolSideEffectContract } from "../types.js";
import type { YeonjangTargetedToolParams } from "./yeonjang-target.js";
type ExpectedStateBuilder<TParams extends YeonjangTargetedToolParams> = (params: TParams, ctx: ToolContext) => Record<string, unknown>;
export declare function hashSideEffectText(value: string): string;
export declare function hashSideEffectValue(value: unknown): string;
export declare function createYeonjangControlSideEffect<TParams extends YeonjangTargetedToolParams>(input: {
    method: string;
    expectedState: ExpectedStateBuilder<TParams>;
    observeState?: (params: TParams, ctx: ToolContext, result: ToolResult, expectedState: Record<string, unknown>) => Promise<{
        verified: boolean;
        observedState: Record<string, unknown>;
    }>;
    observeVerifiedState?: (params: TParams, ctx: ToolContext, result: ToolResult, expectedState: Record<string, unknown>) => Promise<boolean>;
}): ToolSideEffectContract<TParams>;
export {};
//# sourceMappingURL=yeonjang-control-side-effect.d.ts.map