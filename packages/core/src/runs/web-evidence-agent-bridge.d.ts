import type { ToolResult } from "../tools/types.js";
import { runDirectWebEvidencePipeline, runWebEvidencePipeline, type WebEvidencePipelineResult } from "./web-evidence-pipeline.js";
export interface WebEvidencePipelineRunner {
    (input: Parameters<typeof runWebEvidencePipeline>[0]): Promise<WebEvidencePipelineResult>;
}
export interface DirectWebEvidencePipelineRunner {
    (input: Parameters<typeof runDirectWebEvidencePipeline>[0]): Promise<WebEvidencePipelineResult>;
}
export declare function projectValidatedWebToolResultForAgent(toolName: "web_search" | "web_fetch", result: ToolResult): ToolResult;
export declare function projectWebSearchResultForAgent(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    modelContextTokens: number;
    systemToolText: string;
    conversationText: string;
    searchResult: ToolResult;
    signal: AbortSignal;
}>, dependencies: Readonly<{
    runPipeline: WebEvidencePipelineRunner;
}>): Promise<ToolResult>;
export declare function projectWebFetchResultForAgent(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    modelContextTokens: number;
    systemToolText: string;
    conversationText: string;
    documentResult: ToolResult;
    signal: AbortSignal;
}>, dependencies: Readonly<{
    runPipeline: DirectWebEvidencePipelineRunner;
}>): Promise<ToolResult>;
//# sourceMappingURL=web-evidence-agent-bridge.d.ts.map