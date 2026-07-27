import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/types.js";
import type { ExtensionLiveSmokeExecutePort, ExtensionLiveSmokeExecutionInput } from "./extension-live-smoke-runner.js";
type AgentScopedContext = ToolContext & {
    agentId: string;
    capabilityPolicy: NonNullable<ToolContext["capabilityPolicy"]>;
    auditId: string;
};
export declare function createExtensionLiveToolDispatchAdapter(input: {
    readonly dispatcher: Pick<ToolDispatcher, "dispatchAgentScoped">;
    readonly contextFor: (input: ExtensionLiveSmokeExecutionInput) => AgentScopedContext;
    readonly findAuditEventId: (input: {
        runId: string;
        requestGroupId: string;
        toolName: string;
    }) => string | null;
}): ExtensionLiveSmokeExecutePort;
export {};
//# sourceMappingURL=extension-live-tool-dispatch-adapter.d.ts.map