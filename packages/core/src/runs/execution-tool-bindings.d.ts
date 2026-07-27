import type { ChannelSource } from "../channels/contracts.js";
import type { AgentExecutionToolBinding } from "../orchestration/execution-decision-contract.js";
import type { AnyTool } from "../tools/types.js";
type ExecutionToolDescriptor = Pick<AnyTool, "name" | "description" | "riskLevel" | "requiresApproval" | "availableSources" | "evidenceSourceKind" | "sideEffect">;
export declare function projectAgentExecutionToolBindings(input: {
    tools: ExecutionToolDescriptor[];
    source: ChannelSource;
    toolsEnabled: boolean;
}): AgentExecutionToolBinding[];
export {};
//# sourceMappingURL=execution-tool-bindings.d.ts.map