import type { YeonjangBrowserFocusCommandContractDecision, YeonjangBrowserFocusTargetProjection } from "../../capabilities/yeonjang-browser-focus-contract.js";
import type { ToolContext, ToolSideEffectContract } from "../types.js";
export interface CreateYeonjangBrowserFocusSideEffectInput<TParams> {
    target(params: TParams, ctx: ToolContext): YeonjangBrowserFocusTargetProjection;
    targetRef(params: TParams, ctx: ToolContext): string;
    expectedState(params: TParams, ctx: ToolContext): {
        method: "browser.focus";
        target: YeonjangBrowserFocusTargetProjection;
        commandContract: YeonjangBrowserFocusCommandContractDecision;
    };
}
export declare function createYeonjangBrowserFocusSideEffect<TParams>(input: CreateYeonjangBrowserFocusSideEffectInput<TParams>): ToolSideEffectContract<TParams>;
//# sourceMappingURL=yeonjang-browser-focus-side-effect.d.ts.map