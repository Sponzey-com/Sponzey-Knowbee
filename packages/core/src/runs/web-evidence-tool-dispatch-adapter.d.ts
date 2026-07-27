import type { SourceFreshnessPolicy } from "../contracts/web-retrieval.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import type { WebEvidenceSourceFetchPort } from "./web-evidence-pipeline.js";
type WebToolContext = ToolContext & {
    allowWebAccess: true;
};
export declare function createWebEvidenceSourceFetchPort(input: Readonly<{
    dispatcher: Pick<ToolDispatcher, "dispatch">;
    context: WebToolContext;
    freshnessPolicy: SourceFreshnessPolicy;
    onDispatchStarted?: (request: Readonly<{
        candidateRef: string;
        url: string;
    }>) => void;
    onDispatchFinished?: (input: Readonly<{
        candidateRef: string;
        url: string;
        result: ToolResult;
    }>) => void;
}>): WebEvidenceSourceFetchPort;
export {};
//# sourceMappingURL=web-evidence-tool-dispatch-adapter.d.ts.map