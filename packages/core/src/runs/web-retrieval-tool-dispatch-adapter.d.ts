import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/types.js";
import type { WebRetrievalLiveFetchPort, WebRetrievalLiveSearchPort } from "./web-retrieval-live-runner.js";
type WebLiveToolContext = ToolContext & {
    allowWebAccess: true;
};
export declare function createWebRetrievalToolDispatchAdapter(input: {
    readonly dispatcher: Pick<ToolDispatcher, "dispatch">;
    readonly contextFor: (input: {
        runId: string;
        scenario: Parameters<WebRetrievalLiveSearchPort>[0]["scenario"];
        signal: AbortSignal;
    }) => WebLiveToolContext;
    readonly findAuditEventId: (input: {
        runId: string;
        toolName: string;
    }) => string | null;
}): Readonly<{
    search: WebRetrievalLiveSearchPort;
    fetch: WebRetrievalLiveFetchPort;
}>;
export {};
//# sourceMappingURL=web-retrieval-tool-dispatch-adapter.d.ts.map