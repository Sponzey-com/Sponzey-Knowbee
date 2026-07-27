import type { ApprovalDecision, ApprovalKind } from "../events/index.js";
import { ToolDispatcher, type ToolDispatcherDependencies, type ToolRuntimeConfigSnapshot } from "./dispatcher.js";
export declare function initializeToolDispatcher(config: ToolRuntimeConfigSnapshot, dependencies?: Omit<ToolDispatcherDependencies, "config">): ToolDispatcher;
export declare function getToolDispatcher(): ToolDispatcher;
export declare const toolDispatcher: ToolDispatcher;
export declare function grantRunApprovalScope(runId: string, toolName: string, params?: Record<string, unknown>): void;
export declare function grantRunSingleApproval(runId: string, toolName: string, params?: Record<string, unknown>): void;
export declare function resolvePendingInteraction(runId: string, decision: ApprovalDecision): boolean;
export declare function listPendingInteractions(): Array<{
    runId: string;
    toolName: string;
    kind: ApprovalKind;
    guidance?: string;
}>;
//# sourceMappingURL=runtime-dispatcher.d.ts.map