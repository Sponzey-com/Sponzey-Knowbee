import { type PreparedSideEffectOperation } from "../contracts/side-effect-operation.js";
import { type PrepareSideEffectOperationResult } from "../runs/side-effect-operation-use-case.js";
import { type AnyTool, type ToolContext, type ToolResult } from "./types.js";
export interface ResolvedToolSideEffectOperation {
    prepared: PreparedSideEffectOperation;
    executionParams: Record<string, unknown>;
    targetRef: string;
    expectedState: unknown;
    authorizationParams: Record<string, unknown>;
}
export type ResolveToolSideEffectOperationResult = {
    status: "not_required";
} | {
    status: "rejected";
    result: ToolResult;
} | {
    status: "resolved";
    operation: ResolvedToolSideEffectOperation;
};
export declare function resolveToolSideEffectOperation(input: {
    tool: AnyTool;
    params: Record<string, unknown>;
    ctx: ToolContext;
    executionTargetFingerprint?: `sha256:${string}`;
}): ResolveToolSideEffectOperationResult;
export type PrepareToolSideEffectOperationResult = {
    status: "not_required";
} | {
    status: "rejected";
    result: ToolResult;
} | {
    status: "ready";
    admission: Extract<PrepareSideEffectOperationResult, {
        status: "reserved_new" | "reserved_existing";
    }>;
    operation: ResolvedToolSideEffectOperation;
} | {
    status: "existing";
    admission: Exclude<PrepareSideEffectOperationResult, {
        status: "reserved_new" | "reserved_existing" | "rejected";
    }>;
    operation: ResolvedToolSideEffectOperation;
    result: ToolResult;
};
export declare function prepareToolSideEffectOperation(input: {
    tool: AnyTool;
    params: Record<string, unknown>;
    ctx: ToolContext;
    executionTargetFingerprint?: `sha256:${string}`;
}): PrepareToolSideEffectOperationResult;
export declare function admitResolvedToolSideEffectOperation(operation: ResolvedToolSideEffectOperation): Exclude<PrepareToolSideEffectOperationResult, {
    status: "not_required";
}>;
export declare function executeToolWithSideEffectLedger(input: {
    tool: AnyTool;
    params: Record<string, unknown>;
    ctx: ToolContext;
    preparedOperation?: ResolvedToolSideEffectOperation;
}): Promise<ToolResult>;
//# sourceMappingURL=side-effect-runtime.d.ts.map